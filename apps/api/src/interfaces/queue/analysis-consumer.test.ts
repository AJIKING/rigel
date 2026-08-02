// キュー consumer ディスパッチの契約（docs/plans/async-analysis.md）。
// usecase が正常終了（done/failed 化を含む）したメッセージは ack、
// 例外（一過性）は retry（再送回数の管理は Queues と usecase 側の attempts 判定）。

import { describe, expect, it, vi } from "vitest";
import type { RunAnalysisJob } from "../../application/run-analysis-job.usecase";
import type { AnalysisJobMessage } from "../../domain/analysis/analysis-transport";
import { consumeAnalysisBatch } from "./analysis-consumer";

const body: AnalysisJobMessage = {
  jobId: "job-1",
  userId: "u1",
  gameId: "g1",
  cameraBottomSeat: "east",
  riverKey: "jobs/job-1/river",
  handKeys: {},
};

function makeBatch(attempts = 1) {
  const ack = vi.fn();
  const retry = vi.fn();
  const batch = {
    queue: "rigel-analysis-jobs",
    messages: [{ body, attempts, ack, retry }],
  } as unknown as MessageBatch<AnalysisJobMessage>;
  return { batch, ack, retry };
}

describe("consumeAnalysisBatch", () => {
  it("usecase が正常終了したら ack する（attempts を渡す）", async () => {
    const { batch, ack, retry } = makeBatch(2);
    const execute = vi.fn(() => Promise.resolve());

    await consumeAnalysisBatch(batch, { execute } as unknown as RunAnalysisJob);

    expect(execute).toHaveBeenCalledWith(body, 2);
    expect(ack).toHaveBeenCalledTimes(1);
    expect(retry).not.toHaveBeenCalled();
  });

  it("usecase が例外を投げたら retry する（ack しない）", async () => {
    const { batch, ack, retry } = makeBatch();
    const execute = vi.fn(() => Promise.reject(new Error("transient")));

    await consumeAnalysisBatch(batch, { execute } as unknown as RunAnalysisJob);

    expect(retry).toHaveBeenCalledTimes(1);
    expect(ack).not.toHaveBeenCalled();
  });
});
