// ============================================================
// application — 何切るの写真AI再現の非同期ジョブ（Start / Run / Get）
// ------------------------------------------------------------
// docs/plans/async-analysis.md Task 8（[決定] 2026-08-02 オーナー承認・案A）。
// 牌譜ジョブ（start-analysis-job / run-analysis-job）と同じ R2 + Queues 構成だが、
// 結果は「保存されないドラフト Kifu」なので games/game_logs には書かず、
// R2 の result.json（ジョブ prefix 配下＝TTL 1日が効く）に置いて GET で返す。
// ジョブ行（D1）は参照だけを保つ（gameId/logId は null のまま）。
//
// 信頼ゲート:
//   - 結果は書く前（AnalyzeProblemDraft 内）も読む後（GetProblemAnalysisJob）も Zod 検証
//   - 課金は execute 内の「成功時のみ加算」がそのまま効く
//   - 終端書き込みの失敗は再送に乗せない（二重課金防止。run-analysis-job と同じ規律）
// ============================================================

import { KifuSchema, type Kifu, type Seat } from "@rigel/schema";
import type { AnalysisJobRepository } from "../domain/analysis/analysis-job";
import {
  analysisJobPrefix,
  analysisResultKey,
  type AnalysisImageStore,
  type AnalysisQueue,
  type ProblemAnalysisJobMessage,
} from "../domain/analysis/analysis-transport";
import type { AnalysisInput, ImageRef } from "../domain/kifu/analyzer";
import type { AnalyzeProblemDraftResult } from "./analyze-problem-draft.usecase";
import { MAX_ANALYSIS_ATTEMPTS } from "./run-analysis-job.usecase";

type ProblemAnalyzeReason = "user_not_found" | "quota_exceeded";

export interface StartProblemAnalysisJobDeps {
  jobs: AnalysisJobRepository;
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
  { ok: true; jobId: string } | { ok: false; reason: ProblemAnalyzeReason };

export class StartProblemAnalysisJob {
  constructor(private readonly deps: StartProblemAnalysisJobDeps) {}

  async start(params: {
    userId: string;
    cameraBottomSeat: Seat;
    handImage: ImageRef;
    riverImage?: ImageRef;
  }): Promise<StartProblemAnalysisJobResult> {
    const { jobs, images, queue, analyze, now, newId } = this.deps;

    const pre = await analyze.preflight(params.userId);
    if (!pre.ok) return pre;

    const jobId = newId();
    const prefix = analysisJobPrefix(jobId);
    const handKey = `${prefix}hand`;
    const riverKey = params.riverImage ? `${prefix}river` : undefined;
    let jobCreated = false;

    try {
      await images.put(handKey, params.handImage);
      if (riverKey && params.riverImage) await images.put(riverKey, params.riverImage);

      // 半荘は作らない（何切るは保存しないドラフト）。gameId は null のまま。
      await jobs.create({ id: jobId, userId: params.userId, gameId: null, now: now() });
      jobCreated = true;

      const message: ProblemAnalysisJobMessage = {
        kind: "problem",
        jobId,
        userId: params.userId,
        cameraBottomSeat: params.cameraBottomSeat,
        handKey,
        ...(riverKey ? { riverKey } : {}),
      };
      await queue.send(message);
      return { ok: true, jobId };
    } catch (e) {
      // 途中失敗は宙に浮かせない（start-analysis-job と同じ）。画像の掃除は TTL 1日。
      if (jobCreated) {
        await jobs.markFailed(jobId, { reason: "enqueue_failed", now: now() }).catch(() => {});
      }
      throw e;
    }
  }
}

export interface RunProblemAnalysisJobDeps {
  jobs: AnalysisJobRepository;
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
    const { jobs, images, analyze, now } = this.deps;

    const job = await jobs.findForUser(message.jobId, message.userId);
    if (!job || job.status !== "processing") return;

    try {
      const handImage = await images.get(message.handKey);
      if (!handImage) {
        await jobs.markFailed(message.jobId, { reason: "images_missing", now: now() });
        await images.deletePrefix(analysisJobPrefix(message.jobId));
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
          // 結果を先に置いてから done（done が見えた時点で必ず結果が在る順序）。
          await images.putJson(analysisResultKey(message.jobId), result.kifu);
          await jobs.markDone(message.jobId, { gameId: null, logId: null, now: now() });
          // 画像だけ消して result.json は残す（クライアントが取りに来るまで。保険は TTL 1日）。
          await images.delete(message.handKey);
          if (message.riverKey) await images.delete(message.riverKey);
        } else {
          // 失敗は画像を残す（リトライ用。掃除は TTL 1日。牌譜ジョブと同じ）。
          await jobs.markFailed(message.jobId, { reason: result.reason, now: now() });
        }
      } catch (e) {
        console.error("problem analysis job terminal write failed", message.jobId, e);
      }
    } catch (e) {
      if (attempts < MAX_ANALYSIS_ATTEMPTS) throw e; // Queues が再送（画像は残す）
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
}

export class GetProblemAnalysisJob {
  constructor(
    private readonly jobs: AnalysisJobRepository,
    private readonly images: AnalysisImageStore,
  ) {}

  /** 所有者のジョブだけ返す（他人・不存在は null = ルートで 404）。 */
  async execute(id: string, userId: string): Promise<ProblemAnalysisJobView | null> {
    const job = await this.jobs.findForUser(id, userId);
    if (!job) return null;

    const base = {
      id: job.id,
      reason: job.reason,
      createdAt: job.createdAt.toISOString(),
      updatedAt: job.updatedAt.toISOString(),
    };
    if (job.status !== "done") return { ...base, status: job.status, draft: null };

    // done: R2 の結果を出口で再検証して返す。消えていたら（TTL 1日超）失敗として扱う
    // （「done なのに結果が無い」をクライアントに解かせない）。
    const raw = await this.images.getJson(analysisResultKey(job.id));
    const parsed = raw === null ? null : KifuSchema.safeParse(raw);
    if (!parsed?.success) {
      return { ...base, status: "failed", reason: "result_expired", draft: null };
    }
    return { ...base, status: "done", draft: parsed.data };
  }
}
