// 解析ジョブの開始・ポーリング・復元（docs/plans/async-analysis.md）。
// ポーリング予算（2s→5s→10s・10分打ち切り）は @rigel/ui の analysisPollDelayMs に従い、
// ジョブは端末に永続化してアプリを閉じても開き直しで再開できる。

const mockGetAnalysisJob = jest.fn<Promise<unknown>, [string, string]>();
jest.mock("./api", () => ({
  getAnalysisJob: (...a: unknown[]) => mockGetAnalysisJob(...(a as [string, string])),
}));

const mockStore = new Map<string, string>();
jest.mock("expo-secure-store", () => ({
  getItemAsync: (k: string) => Promise.resolve(mockStore.get(k) ?? null),
  setItemAsync: (k: string, v: string) => {
    mockStore.set(k, v);
    return Promise.resolve();
  },
  deleteItemAsync: (k: string) => {
    mockStore.delete(k);
    return Promise.resolve();
  },
}));

import {
  clearPendingAnalysis,
  loadPendingAnalysis,
  pollAnalysisJob,
  savePendingAnalysis,
} from "./analysis-job";

const doneJob = { id: "j1", status: "done", gameId: "g1", logId: "l1", reason: null };
const processing = { id: "j1", status: "processing", gameId: null, logId: null, reason: null };

function makeClock(startMs = 0) {
  let t = startMs;
  return {
    now: () => t,
    sleep: (ms: number) => {
      t += ms;
      return Promise.resolve();
    },
  };
}

describe("pending job の永続化", () => {
  beforeEach(() => mockStore.clear());

  it("save → load → clear が往復する（開き直しの復元用）", async () => {
    await savePendingAnalysis({ jobId: "j1", startedAt: 123 });
    expect(await loadPendingAnalysis()).toEqual({ jobId: "j1", startedAt: 123 });

    await clearPendingAnalysis();
    expect(await loadPendingAnalysis()).toBeNull();
  });

  it("壊れた保存値は null（復元でクラッシュしない）", async () => {
    mockStore.set("rigel.analysisJob", "{broken json");
    expect(await loadPendingAnalysis()).toBeNull();
  });
});

describe("pollAnalysisJob", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockStore.clear();
  });

  it("done になったら gameId/logId を返す", async () => {
    mockGetAnalysisJob
      .mockResolvedValueOnce(processing)
      .mockResolvedValueOnce(processing)
      .mockResolvedValueOnce(doneJob);
    const clock = makeClock();

    const outcome = await pollAnalysisJob("tok", { jobId: "j1", startedAt: 0 }, clock);

    expect(outcome).toEqual({ kind: "done", gameId: "g1", logId: "l1" });
    expect(mockGetAnalysisJob).toHaveBeenCalledWith("tok", "j1");
  });

  it("failed は理由の日本語メッセージを返す", async () => {
    mockGetAnalysisJob.mockResolvedValueOnce({
      ...processing,
      status: "failed",
      reason: "game_full",
    });

    const outcome = await pollAnalysisJob("tok", { jobId: "j1", startedAt: 0 }, makeClock());

    expect(outcome.kind).toBe("failed");
    if (outcome.kind === "failed") expect(outcome.message).toMatch(/30局/);
  });

  it("ジョブが見つからない（404=TTL掃除後など）は失敗扱い", async () => {
    mockGetAnalysisJob.mockResolvedValueOnce(null);

    const outcome = await pollAnalysisJob("tok", { jobId: "j1", startedAt: 0 }, makeClock());

    expect(outcome.kind).toBe("failed");
  });

  it("10分を超えたら timeout で打ち切る（リクエストを無限に増やさない）", async () => {
    mockGetAnalysisJob.mockResolvedValue(processing);
    const clock = makeClock();

    const outcome = await pollAnalysisJob("tok", { jobId: "j1", startedAt: 0 }, clock);

    expect(outcome).toEqual({ kind: "timeout" });
    // 予算どおりなら 15回(2s) + 18回(5s) + 48回(10s) = 81回程度に収まる。
    expect(mockGetAnalysisJob.mock.calls.length).toBeLessThan(90);
  });

  it("一時的な取得失敗（例外）ではポーリングを打ち切らない", async () => {
    mockGetAnalysisJob.mockRejectedValueOnce(new Error("network")).mockResolvedValueOnce(doneJob);

    const outcome = await pollAnalysisJob("tok", { jobId: "j1", startedAt: 0 }, makeClock());

    expect(outcome.kind).toBe("done");
  });
});
