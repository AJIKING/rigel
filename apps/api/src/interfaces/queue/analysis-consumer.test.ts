// キュー consumer ディスパッチの契約（docs/plans/async-analysis.md）。
// usecase が正常終了（done/failed 化を含む）したメッセージは ack、
// 例外（一過性）は retry（再送回数の管理は Queues と usecase 側の attempts 判定）。
// kind で牌譜/何切るを振り分ける（kind 省略=既存の牌譜メッセージ互換）。

import { describe, expect, it, vi } from "vitest";
import type { RunProblemAnalysisJob } from "../../application/problem-analysis-job.usecase";
import type { RunAnalysisJob } from "../../application/run-analysis-job.usecase";
import type { AnalysisJobMessage } from "../../domain/analysis/analysis-transport";
import { consumeAnalysisBatch, type AnalysisConsumers } from "./analysis-consumer";

const body: AnalysisJobMessage = {
  jobId: "job-1",
  userId: "u1",
  gameId: "g1",
  cameraBottomSeat: "east",
  riverKey: "jobs/job-1/river",
  handKeys: {},
};

const problemBody: AnalysisJobMessage = {
  kind: "problem",
  jobId: "job-2",
  userId: "u1",
  draftId: "d-1",
  cameraBottomSeat: "east",
  handKey: "problems/d-1/job-2/hand",
};

function makeBatch(message: AnalysisJobMessage, attempts = 1) {
  const ack = vi.fn();
  const retry = vi.fn();
  const batch = {
    queue: "rigel-analysis-jobs",
    messages: [{ body: message, attempts, ack, retry }],
  } as unknown as MessageBatch<AnalysisJobMessage>;
  return { batch, ack, retry };
}

function makeConsumers() {
  const runKifu = vi.fn(() => Promise.resolve());
  const runProblem = vi.fn(() => Promise.resolve());
  const consumers: AnalysisConsumers = {
    runKifu: { execute: runKifu } as unknown as RunAnalysisJob,
    runProblem: { execute: runProblem } as unknown as RunProblemAnalysisJob,
  };
  return { consumers, runKifu, runProblem };
}

describe("consumeAnalysisBatch", () => {
  it("kind 無し（牌譜）のメッセージは runKifu へ渡し、正常終了で ack する（attempts を渡す）", async () => {
    const { batch, ack, retry } = makeBatch(body, 2);
    const { consumers, runKifu, runProblem } = makeConsumers();

    await consumeAnalysisBatch(batch, consumers);

    expect(runKifu).toHaveBeenCalledWith(body, 2);
    expect(runProblem).not.toHaveBeenCalled();
    expect(ack).toHaveBeenCalledTimes(1);
    expect(retry).not.toHaveBeenCalled();
  });

  it("kind=problem のメッセージは runProblem へ渡す", async () => {
    const { batch, ack } = makeBatch(problemBody, 3);
    const { consumers, runKifu, runProblem } = makeConsumers();

    await consumeAnalysisBatch(batch, consumers);

    expect(runProblem).toHaveBeenCalledWith(problemBody, 3);
    expect(runKifu).not.toHaveBeenCalled();
    expect(ack).toHaveBeenCalledTimes(1);
  });

  it("usecase が例外を投げたら retry する（ack しない）", async () => {
    const { batch, ack, retry } = makeBatch(body);
    const { consumers, runKifu } = makeConsumers();
    runKifu.mockRejectedValue(new Error("transient"));

    await consumeAnalysisBatch(batch, consumers);

    expect(retry).toHaveBeenCalledTimes(1);
    expect(ack).not.toHaveBeenCalled();
  });
});
