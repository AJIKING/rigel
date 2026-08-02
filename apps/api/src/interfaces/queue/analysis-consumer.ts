// interfaces/queue — 解析ジョブキューの consumer ディスパッチ（docs/plans/async-analysis.md）。
// wrangler.toml の max_batch_size=1 だが、複数件でも順に処理できる形にしておく。
// メッセージの kind で牌譜解析（省略=既存メッセージ互換）と何切る解析を振り分ける。
// usecase が終端まで処理したら ack。例外（一過性想定）は retry し、
// 最終試行の判定は usecase 側が message.attempts で行う（尽きたら failed に落として正常終了）。

import type { RunProblemAnalysisJob } from "../../application/problem-analysis-job.usecase";
import type { RunAnalysisJob } from "../../application/run-analysis-job.usecase";
import type { AnalysisJobMessage } from "../../domain/analysis/analysis-transport";

export interface AnalysisConsumers {
  runKifu: RunAnalysisJob;
  runProblem: RunProblemAnalysisJob;
}

export async function consumeAnalysisBatch(
  batch: MessageBatch<AnalysisJobMessage>,
  consumers: AnalysisConsumers,
): Promise<void> {
  for (const message of batch.messages) {
    try {
      const body = message.body;
      if (body.kind === "problem") await consumers.runProblem.execute(body, message.attempts);
      else await consumers.runKifu.execute(body, message.attempts);
      message.ack();
    } catch (e) {
      console.warn("analysis message retry", message.body.jobId, e);
      message.retry();
    }
  }
}
