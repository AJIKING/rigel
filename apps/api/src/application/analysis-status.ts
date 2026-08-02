// ============================================================
// application — 半荘の解析状態の導出（plan 8-3 半荘先行作成）
// ------------------------------------------------------------
// 一覧・半荘詳細の DTO に載せる analysisStatus を、その半荘の「最新ジョブ」から導く。
// サーバーが真実源（端末をまたいでも解析中/失敗が見える）。
// processing のまま長時間経過した行（終端書き込み失敗などで宙に浮いたもの）は
// failed 扱いにして「永遠に解析中」に見せない。
// ============================================================

import type { AnalysisJob } from "../domain/analysis/analysis-job";

export type GameAnalysisStatus = "processing" | "failed";

/** これを超えて processing のままのジョブは表示上 failed 扱い。 */
export const STALE_ANALYSIS_MS = 30 * 60_000;

/** ジョブ一覧（新しい順でなくてもよい）→ gameId ごとの表示ステータス。done は載せない。 */
export function deriveAnalysisStatus(
  jobs: AnalysisJob[],
  now: Date,
): Map<string, GameAnalysisStatus> {
  // 半荘ごとに最新（createdAt 最大）のジョブだけを採用する。
  const latest = new Map<string, AnalysisJob>();
  for (const job of jobs) {
    if (!job.gameId) continue; // 半荘先行作成より前の旧ジョブ
    const cur = latest.get(job.gameId);
    if (!cur || job.createdAt.getTime() > cur.createdAt.getTime()) latest.set(job.gameId, job);
  }

  const result = new Map<string, GameAnalysisStatus>();
  for (const [gameId, job] of latest) {
    if (job.status === "failed") result.set(gameId, "failed");
    else if (job.status === "processing") {
      const stale = now.getTime() - job.createdAt.getTime() > STALE_ANALYSIS_MS;
      result.set(gameId, stale ? "failed" : "processing");
    }
  }
  return result;
}
