// 解析ジョブのグローバル状態（docs/plans/async-analysis.md 8-2 案B）。
// ポーリングは画面ではなく Provider が一本で持つ（画面遷移・開き直しでも進行が生き、
// 二重ポーリングが構造的に起きない）。カード状態: processing → done(消える)/failed/timeout。

import { renderHook, waitFor } from "@testing-library/react-native";
import type { ReactNode } from "react";

jest.mock("./auth", () => ({ useAuth: () => ({ token: "tok" }) }));

const mockPoll = jest.fn<Promise<unknown>, unknown[]>();
const mockSave = jest.fn(() => Promise.resolve());
const mockClear = jest.fn(() => Promise.resolve());
let mockStored: { jobId: string; startedAt: number; seq?: number } | null = null;
jest.mock("./analysis-job", () => ({
  pollAnalysisJob: (...a: unknown[]) => mockPoll(...a),
  savePendingAnalysis: (...a: unknown[]) => mockSave(...(a as [])),
  loadPendingAnalysis: () => Promise.resolve(mockStored),
  clearPendingAnalysis: () => mockClear(),
}));

import { AnalysisJobProvider, useAnalysisJob } from "./use-analysis-job";

const wrapper = ({ children }: { children: ReactNode }) => (
  <AnalysisJobProvider>{children}</AnalysisJobProvider>
);

describe("useAnalysisJob", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockStored = null;
  });

  it("start で永続化して processing カードを出し、done でカードが消え completedCount が増える", async () => {
    mockPoll.mockResolvedValue({ kind: "done", gameId: "g1", logId: "l1" });
    const { result } = renderHook(() => useAnalysisJob(), { wrapper });

    await result.current.start({ jobId: "j1", startedAt: 0, seq: 3 });

    expect(mockSave).toHaveBeenCalledWith({ jobId: "j1", startedAt: 0, seq: 3 });
    await waitFor(() => expect(result.current.completedCount).toBe(1));
    expect(result.current.card).toBeNull();
    expect(mockClear).toHaveBeenCalled();
  });

  it("failed は理由付きカードになり、dismiss で消える", async () => {
    mockPoll.mockResolvedValue({ kind: "failed", message: "解析に失敗しました。" });
    const { result } = renderHook(() => useAnalysisJob(), { wrapper });

    await result.current.start({ jobId: "j1", startedAt: 0 });

    await waitFor(() =>
      expect(result.current.card).toEqual({ kind: "failed", message: "解析に失敗しました。" }),
    );
    result.current.dismiss();
    await waitFor(() => expect(result.current.card).toBeNull());
  });

  it("timeout は案内カードになる（completedCount は増えない）", async () => {
    mockPoll.mockResolvedValue({ kind: "timeout" });
    const { result } = renderHook(() => useAnalysisJob(), { wrapper });

    await result.current.start({ jobId: "j1", startedAt: 0 });

    await waitFor(() => expect(result.current.card).toEqual({ kind: "timeout" }));
    expect(result.current.completedCount).toBe(0);
  });

  it("マウント時に保存済みジョブがあれば復元してポーリングする（開き直し）", async () => {
    mockStored = { jobId: "j9", startedAt: 100, seq: 5 };
    mockPoll.mockResolvedValue({ kind: "done", gameId: "g9", logId: "l9" });
    const { result } = renderHook(() => useAnalysisJob(), { wrapper });

    await waitFor(() => expect(result.current.completedCount).toBe(1));
    expect(mockPoll).toHaveBeenCalledWith("tok", { jobId: "j9", startedAt: 100, seq: 5 });
  });

  it("Provider の外では不活性な既定値を返す（テスト・未配線画面を壊さない）", () => {
    const { result } = renderHook(() => useAnalysisJob());
    expect(result.current.card).toBeNull();
  });
});
