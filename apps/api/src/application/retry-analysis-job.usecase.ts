// ============================================================
// application — RetryAnalysisJob（Phase 2「もう一度解析」）
// ------------------------------------------------------------
// async-analysis.md 8-3: 失敗ジョブの一時画像と message.json は R2 に残している
// （TTL 1日）ので、再アップロード無しで同じメッセージを再 enqueue する。
//   - 枠・半荘上限は再チェック（前回失敗が quota 系なら今回も正直に断る）
//   - 同じ半荘に別の processing ジョブがあれば 409（二局作成ガードと同じ規律）
//   - R2 が消えていたら retry_expired（写真からの再送信を促す）
//   - キュー投入失敗は failed に戻す（processing で宙に浮かせない）
// ============================================================

import type { AnalysisJobRepository } from "../domain/analysis/analysis-job";
import {
  gameJobMessageKey,
  type AnalysisImageStore,
  type AnalysisQueue,
  type KifuAnalysisJobMessage,
} from "../domain/analysis/analysis-transport";
import type { AnalyzeReason } from "./analyze-and-save-kifu.usecase";

export type RetryAnalysisReason = AnalyzeReason | "not_found" | "not_failed" | "retry_expired";

export type RetryAnalysisJobResult =
  { ok: true; jobId: string; gameId: string | null } | { ok: false; reason: RetryAnalysisReason };

export interface RetryAnalysisJobDeps {
  jobs: AnalysisJobRepository;
  images: AnalysisImageStore;
  queue: AnalysisQueue;
  /** 同期検証だけを使う（AnalyzeAndSaveKifu.preflight。枠・半荘上限）。 */
  analyze: {
    preflight(
      userId: string,
      gameId?: string,
    ): Promise<{ ok: true } | { ok: false; reason: AnalyzeReason }>;
  };
  now: () => Date;
}

/** message.json の控えとして最低限の形か（自分たちが書いたものだが、出所を盲信しない）。 */
function isKifuMessage(raw: unknown, jobId: string): raw is KifuAnalysisJobMessage {
  if (typeof raw !== "object" || raw === null) return false;
  const m = raw as Partial<KifuAnalysisJobMessage>;
  return m.jobId === jobId && typeof m.riverKey === "string" && typeof m.userId === "string";
}

export class RetryAnalysisJob {
  constructor(private readonly deps: RetryAnalysisJobDeps) {}

  async execute(params: { userId: string; jobId: string }): Promise<RetryAnalysisJobResult> {
    const { jobs, images, queue, analyze, now } = this.deps;

    const job = await jobs.findForUser(params.jobId, params.userId);
    if (!job) return { ok: false, reason: "not_found" };
    if (job.status !== "failed") return { ok: false, reason: "not_failed" };
    if (!job.gameId) return { ok: false, reason: "retry_expired" }; // 何切るジョブ等は対象外

    // R2 の控えと画像は半荘と同じ寿命で恒久（photo-retention.md）。無いのは
    // 旧TTLバケット世代のジョブ・手動削除だけなので、そのときは正直に断る。
    const raw = await images.getJson(gameJobMessageKey(job.gameId, job.id));
    if (!isKifuMessage(raw, job.id)) return { ok: false, reason: "retry_expired" };
    if (!(await images.get(raw.riverKey))) return { ok: false, reason: "retry_expired" };

    // 枠・半荘上限の再チェック（時間が経っているので前回の検証は信用しない）。
    const pre = await analyze.preflight(params.userId, job.gameId ?? undefined);
    if (!pre.ok) return pre;

    // 同じ半荘に別の processing ジョブがあるうちは受け付けない（生の status で判定）。
    if (job.gameId) {
      const running = (await jobs.listActiveByUser(params.userId)).find(
        (j) => j.gameId === job.gameId && j.status === "processing",
      );
      if (running) return { ok: false, reason: "game_analyzing" };
    }

    await jobs.markProcessing(job.id, { now: now() });
    try {
      await queue.send(raw);
    } catch (e) {
      // processing のまま宙に浮かせない（consumer は来ないので誰も終端に落とせない）。
      await jobs.markFailed(job.id, { reason: "enqueue_failed", now: now() }).catch(() => {});
      throw e;
    }
    return { ok: true, jobId: job.id, gameId: job.gameId };
  }
}
