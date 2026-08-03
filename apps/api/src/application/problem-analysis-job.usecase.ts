// ============================================================
// application — 何切るの写真AI再現の非同期ジョブ（Start / Run / Get）
// ------------------------------------------------------------
// [決定] 2026-08-03 photo-retention.md: 送信時に**解析下書き（problem_drafts）を
// 先行作成**し、写真は problems/{draftId}/{jobId}/ へ恒久保存する（半荘先行作成の
// 何切る版）。解析完了で下書きに結果（Kifu）が入り、画面を閉じても消えない。
// 写真・下書きの削除はデータ削除時のみ（下書き破棄・問題削除・退会）。
//
// 信頼ゲート:
//   - 結果は書く前（AnalyzeProblemDraft 内）も読む後（GetProblemAnalysisJob）も Zod 検証
//   - 課金は execute 内の「成功時のみ加算」がそのまま効く
//   - 終端書き込みの失敗は再送に乗せない（二重課金防止。run-analysis-job と同じ規律）
// ============================================================

import { KifuSchema, type Kifu, type Seat } from "@rigel/schema";
import type { AnalysisJobRepository } from "../domain/analysis/analysis-job";
import {
  problemDraftJobPrefix,
  type AnalysisImageStore,
  type AnalysisQueue,
  type ProblemAnalysisJobMessage,
} from "../domain/analysis/analysis-transport";
import type { AnalysisInput, ImageRef } from "../domain/kifu/analyzer";
import type { ProblemDraftRepository } from "../domain/problem/problem-draft.repository";
import type { AnalyzeProblemDraftResult } from "./analyze-problem-draft.usecase";
import { MAX_ANALYSIS_ATTEMPTS } from "./run-analysis-job.usecase";

type ProblemAnalyzeReason = "user_not_found" | "quota_exceeded";

export interface StartProblemAnalysisJobDeps {
  jobs: AnalysisJobRepository;
  drafts: ProblemDraftRepository;
  images: AnalysisImageStore;
  queue: AnalysisQueue;
  /** 同期検証（枠）だけを使う（解析本体は consumer 側）。 */
  analyze: {
    preflight(userId: string): Promise<{ ok: true } | { ok: false; reason: ProblemAnalyzeReason }>;
  };
  now: () => Date;
  newId: () => string;
}

export type StartProblemAnalysisJobResult =
  | { ok: true; jobId: string; draftId: string }
  | { ok: false; reason: ProblemAnalyzeReason };

export class StartProblemAnalysisJob {
  constructor(private readonly deps: StartProblemAnalysisJobDeps) {}

  async start(params: {
    userId: string;
    cameraBottomSeat: Seat;
    handImage: ImageRef;
    riverImage?: ImageRef;
  }): Promise<StartProblemAnalysisJobResult> {
    const { jobs, drafts, images, queue, analyze, now, newId } = this.deps;

    const pre = await analyze.preflight(params.userId);
    if (!pre.ok) return pre;

    const draftId = newId();
    const jobId = newId();
    const prefix = problemDraftJobPrefix(draftId, jobId);
    const handKey = `${prefix}hand`;
    const riverKey = params.riverImage ? `${prefix}river` : undefined;
    let jobCreated = false;

    try {
      // 行（ジョブ→下書き）を先に作ってからアップロード（牌譜と同型。孤児画像なし）。
      await jobs.create({ id: jobId, userId: params.userId, gameId: null, now: now() });
      jobCreated = true;
      await drafts.create({ id: draftId, userId: params.userId, jobId, now: now() });

      await images.put(handKey, params.handImage);
      if (riverKey && params.riverImage) await images.put(riverKey, params.riverImage);

      const message: ProblemAnalysisJobMessage = {
        kind: "problem",
        jobId,
        userId: params.userId,
        draftId,
        cameraBottomSeat: params.cameraBottomSeat,
        handKey,
        ...(riverKey ? { riverKey } : {}),
      };
      await queue.send(message);
      return { ok: true, jobId, draftId };
    } catch (e) {
      // 途中失敗は宙に浮かせない: ジョブを failed に落とす（下書きは「解析失敗」で見える）。
      if (jobCreated) {
        await jobs.markFailed(jobId, { reason: "enqueue_failed", now: now() }).catch(() => {});
      }
      throw e;
    }
  }
}

export interface RunProblemAnalysisJobDeps {
  jobs: AnalysisJobRepository;
  drafts: ProblemDraftRepository;
  images: AnalysisImageStore;
  /** 解析本体（枠チェック・成功時のみ課金を含む既存ユースケース。保存はしない）。 */
  analyze: {
    execute(params: { userId: string; input: AnalysisInput }): Promise<AnalyzeProblemDraftResult>;
  };
  now: () => Date;
}

export class RunProblemAnalysisJob {
  constructor(private readonly deps: RunProblemAnalysisJobDeps) {}

  async execute(message: ProblemAnalysisJobMessage, attempts: number): Promise<void> {
    const { jobs, drafts, images, analyze, now } = this.deps;

    const job = await jobs.findForUser(message.jobId, message.userId);
    if (!job || job.status !== "processing") return;

    try {
      const handImage = await images.get(message.handKey);
      if (!handImage) {
        // 旧TTLバケット世代のメッセージ・手動削除に耐える（画像が無ければ解析できない）。
        await jobs.markFailed(message.jobId, { reason: "images_missing", now: now() });
        return;
      }
      const riverImage = message.riverKey ? await images.get(message.riverKey) : null;

      const result = await analyze.execute({
        userId: message.userId,
        input: {
          hands: { bottom: handImage },
          cameraBottomSeat: message.cameraBottomSeat,
          ...(riverImage ? { riverImage } : {}),
        },
      });

      // 終端書き込みは再送に乗せない（execute は課金加算済み。run-analysis-job と同じ）。
      try {
        if (result.ok) {
          // 結果を先に下書きへ置いてから done（done が見えた時点で必ず結果がある順序）。
          await drafts.setKifu(message.draftId, { kifu: result.kifu, now: now() });
          await jobs.markDone(message.jobId, { gameId: null, logId: null, now: now() });
          // 写真は消さない（下書き→問題に紐づく恒久データ。掃除はデータ削除時のみ）。
        } else {
          await jobs.markFailed(message.jobId, { reason: result.reason, now: now() });
        }
      } catch (e) {
        console.error("problem analysis job terminal write failed", message.jobId, e);
      }
    } catch (e) {
      if (attempts < MAX_ANALYSIS_ATTEMPTS) throw e; // Queues が再送（画像は残る）
      console.error("problem analysis job failed permanently", message.jobId, e);
      await jobs
        .markFailed(message.jobId, { reason: "analysis_failed", now: now() })
        .catch(() => {});
    }
  }
}

/** ジョブ状態のクライアント向け DTO。done なら結果ドラフト（Zod 検証済み）を同梱する。 */
export interface ProblemAnalysisJobView {
  id: string;
  status: "processing" | "done" | "failed";
  reason: string | null;
  createdAt: string;
  updatedAt: string;
  draft: Kifu | null;
  /** 解析下書きの ID（先行作成。閉じてもマイページから開ける）。旧ジョブは null。 */
  draftId: string | null;
}

export class GetProblemAnalysisJob {
  constructor(
    private readonly jobs: AnalysisJobRepository,
    private readonly drafts: ProblemDraftRepository,
  ) {}

  /** 所有者のジョブだけ返す（他人・不存在は null = ルートで 404）。 */
  async execute(id: string, userId: string): Promise<ProblemAnalysisJobView | null> {
    const job = await this.jobs.findForUser(id, userId);
    if (!job) return null;

    const draft = await this.drafts.findByJobForUser(job.id, userId);
    const base = {
      id: job.id,
      reason: job.reason,
      createdAt: job.createdAt.toISOString(),
      updatedAt: job.updatedAt.toISOString(),
      draftId: draft?.id ?? null,
    };
    if (job.status !== "done") return { ...base, status: job.status, draft: null };

    // done: 下書きの結果を出口で再検証して返す。無い（旧世代・破棄済み）は失敗として扱う
    // （「done なのに結果が無い」をクライアントに解かせない）。
    const parsed = draft?.kifu == null ? null : KifuSchema.safeParse(draft.kifu);
    if (!parsed?.success) {
      return { ...base, status: "failed", reason: "result_expired", draft: null };
    }
    return { ...base, status: "done", draft: parsed.data };
  }
}
