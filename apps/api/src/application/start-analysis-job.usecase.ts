// ============================================================
// application — StartAnalysisJob / GetAnalysisJob ユースケース
// ------------------------------------------------------------
// 解析の非同期ジョブ化（docs/plans/async-analysis.md・R2 + Queues 構成）。
// start(): 同期検証（枠・半荘 = AnalyzeAndSaveKifu.preflight）を通ったときだけ、
//   画像を一時ストア（R2）へ置き、processing のジョブを作り、キューへ投入して jobId を返す。
//   投入に失敗したらジョブを failed に落とし一時画像を削除する（宙に浮かせない）。
// 解析本体はキュー consumer（RunAnalysisJob）が実行する。
// ============================================================

import type { CameraSeat, Seat } from "@rigel/schema";
import type { AnalysisJobRepository } from "../domain/analysis/analysis-job";
import {
  analysisJobPrefix,
  analysisMessageKey,
  type AnalysisImageStore,
  type AnalysisQueue,
  type KifuAnalysisJobMessage,
} from "../domain/analysis/analysis-transport";
import type { GameRepository } from "../domain/game/game.repository";
import type { ImageRef } from "../domain/kifu/analyzer";
import type { AnalyzeReason } from "./analyze-and-save-kifu.usecase";

export interface StartAnalysisJobDeps {
  jobs: AnalysisJobRepository;
  images: AnalysisImageStore;
  queue: AnalysisQueue;
  /** 半荘先行作成（plan 8-3）: 新規の場合ここで半荘を作る。 */
  games: GameRepository;
  /** 同期検証だけを使う（解析本体は consumer 側）。 */
  analyze: {
    preflight(
      userId: string,
      gameId?: string,
    ): Promise<{ ok: true } | { ok: false; reason: AnalyzeReason }>;
  };
  now: () => Date;
  newId: () => string;
}

export interface StartAnalysisParams {
  userId: string;
  /** 追加先の半荘。未指定なら新しい半荘を作る。 */
  gameId?: string;
  cameraBottomSeat: Seat;
  riverImage: ImageRef;
  hands: Partial<Record<CameraSeat, ImageRef>>;
  /** 1枚モード（河写真から手前の手牌も読む）。 */
  handFromRiver?: boolean;
}

export type StartAnalysisJobResult =
  { ok: true; jobId: string; gameId: string } | { ok: false; reason: AnalyzeReason };

/** ジョブ状態のクライアント向け DTO（userId は出さない）。 */
export interface AnalysisJobView {
  id: string;
  status: "processing" | "done" | "failed";
  gameId: string | null;
  logId: string | null;
  reason: string | null;
  createdAt: string;
  updatedAt: string;
}

export class GetAnalysisJob {
  constructor(private readonly jobs: AnalysisJobRepository) {}

  /** 所有者のジョブだけ返す（他人・不存在は null = ルートで 404）。 */
  async execute(id: string, userId: string): Promise<AnalysisJobView | null> {
    const job = await this.jobs.findForUser(id, userId);
    if (!job) return null;
    return {
      id: job.id,
      status: job.status,
      gameId: job.gameId,
      logId: job.logId,
      reason: job.reason,
      createdAt: job.createdAt.toISOString(),
      updatedAt: job.updatedAt.toISOString(),
    };
  }
}

export class StartAnalysisJob {
  constructor(private readonly deps: StartAnalysisJobDeps) {}

  async start(params: StartAnalysisParams): Promise<StartAnalysisJobResult> {
    const { jobs, images, queue, games, analyze, now, newId } = this.deps;

    const pre = await analyze.preflight(params.userId, params.gameId);
    if (!pre.ok) return pre;

    const isNewGame = !params.gameId;
    if (params.gameId) {
      // 同じ半荘に processing のジョブがあるうちは受け付けない（再送信による二局作成の根治）。
      // 表示用の stale 降格（30分→failed 扱い）はここでは使わない: 終端書き込み失敗などで
      // 実際にはジョブが完走していても processing のまま残るため、時間で緩めると
      // 二局の穴が開き直る。生の status で判定する。
      const latest = (await jobs.listActiveByUser(params.userId)).find(
        (j) => j.gameId === params.gameId,
      );
      if (latest?.status === "processing") {
        return { ok: false, reason: "game_analyzing" };
      }
    }
    const gameId = params.gameId ?? newId();

    const jobId = newId();
    const prefix = analysisJobPrefix(jobId);
    const riverKey = `${prefix}river`;
    const handKeys: Partial<Record<CameraSeat, string>> = {};
    let jobCreated = false;

    try {
      await images.put(riverKey, params.riverImage);
      for (const [cam, image] of Object.entries(params.hands) as [CameraSeat, ImageRef][]) {
        const key = `${prefix}hand_${cam}`;
        await images.put(key, image);
        handKeys[cam] = key;
      }

      await jobs.create({ id: jobId, userId: params.userId, gameId, now: now() });
      jobCreated = true;

      // 半荘先行作成（plan 8-3）はジョブ行の後: 画像アップロード等で失敗したとき、
      // ステータスの付かない「見えない空半荘」を残さないため。
      // 失敗しても半荘は 0 局のまま「解析失敗」ステータスで残す（[決定] 2026-08-02）。
      if (isNewGame) {
        await games.save({ id: gameId, userId: params.userId, title: "", createdAt: now() });
      }

      const message: KifuAnalysisJobMessage = {
        jobId,
        userId: params.userId,
        gameId,
        cameraBottomSeat: params.cameraBottomSeat,
        riverKey,
        handKeys,
        ...(params.handFromRiver ? { handFromRiver: true } : {}),
      };
      // 再解析（Phase 2）用の控え。画像と同じ寿命（done で掃除・TTL 1日）。
      await images.putJson(analysisMessageKey(jobId), message);
      await queue.send(message);
      return { ok: true, jobId, gameId };
    } catch (e) {
      // 途中失敗は宙に浮かせない: ジョブ行があるときだけ failed に落とす（無ければ何も
      // 永続化されていない）。画像は消さない（掃除は R2 のライフサイクル1日。plan 8-3）。
      if (jobCreated) {
        await jobs.markFailed(jobId, { reason: "enqueue_failed", now: now() }).catch(() => {});
      }
      throw e;
    }
  }
}
