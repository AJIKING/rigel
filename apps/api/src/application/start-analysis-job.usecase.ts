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
  type AnalysisImageStore,
  type AnalysisJobMessage,
  type AnalysisQueue,
} from "../domain/analysis/analysis-transport";
import type { GameRepository } from "../domain/game/game.repository";
import type { ImageRef } from "../domain/kifu/analyzer";
import { deriveAnalysisStatus } from "./analysis-status";
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

    let gameId = params.gameId;
    if (gameId) {
      // 同じ半荘に processing のジョブがあるうちは受け付けない（再送信による二局作成の根治。
      // クライアント表示が失敗/タイムアウトでもサーバーのジョブは進んでいることがある）。
      const status = deriveAnalysisStatus(await jobs.listByUser(params.userId), now());
      if (status.get(gameId) === "processing") {
        return { ok: false, reason: "game_analyzing" };
      }
    } else {
      // 半荘先行作成（plan 8-3）: 解析中/失敗をこの半荘の実体として見せる。
      // 失敗しても半荘は 0 局のまま「解析失敗」ステータスで残す（[決定] 2026-08-02）。
      gameId = newId();
      await games.save({ id: gameId, userId: params.userId, title: "", createdAt: now() });
    }

    const jobId = newId();
    const prefix = analysisJobPrefix(jobId);
    const riverKey = `${prefix}river`;
    const handKeys: Partial<Record<CameraSeat, string>> = {};

    try {
      await images.put(riverKey, params.riverImage);
      for (const [cam, image] of Object.entries(params.hands) as [CameraSeat, ImageRef][]) {
        const key = `${prefix}hand_${cam}`;
        await images.put(key, image);
        handKeys[cam] = key;
      }

      await jobs.create({ id: jobId, userId: params.userId, gameId, now: now() });

      const message: AnalysisJobMessage = {
        jobId,
        userId: params.userId,
        gameId,
        cameraBottomSeat: params.cameraBottomSeat,
        riverKey,
        handKeys,
        ...(params.handFromRiver ? { handFromRiver: true } : {}),
      };
      await queue.send(message);
      return { ok: true, jobId, gameId };
    } catch (e) {
      // 途中失敗は宙に浮かせない: ジョブがあれば failed に。画像は消さない
      // （失敗した半荘のリトライ用に残す方針。掃除は R2 のライフサイクル1日。plan 8-3）。
      await jobs.markFailed(jobId, { reason: "enqueue_failed", now: now() }).catch(() => {});
      throw e;
    }
  }
}
