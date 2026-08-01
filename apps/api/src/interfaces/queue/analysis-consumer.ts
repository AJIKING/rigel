// interfaces/queue — 解析ジョブキューの consumer ディスパッチ（docs/plans/async-analysis.md）。
// wrangler.toml の max_batch_size=1 だが、複数件でも順に処理できる形にしておく。
// usecase（RunAnalysisJob）が終端まで処理したら ack。例外（一過性想定）は retry し、
// 最終試行の判定は usecase 側が message.attempts で行う（尽きたら failed に落として正常終了）。

import type { RunAnalysisJob } from "../../application/run-analysis-job.usecase";
import type { AnalysisJobMessage } from "../../domain/analysis/analysis-transport";

export async function consumeAnalysisBatch(
  batch: MessageBatch<AnalysisJobMessage>,
  run: RunAnalysisJob,
): Promise<void> {
  for (const message of batch.messages) {
    try {
      await run.execute(message.body, message.attempts);
      message.ack();
    } catch (e) {
      console.warn("analysis message retry", message.body.jobId, e);
      message.retry();
    }
  }
}
