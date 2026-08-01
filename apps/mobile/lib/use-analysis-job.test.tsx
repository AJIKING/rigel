// 解析ジョブのグローバル状態（docs/plans/async-analysis.md 8-2 案B）。
// ポーリングは画面ではなく Provider が一本で持つ（画面遷移・開き直しでも進行が生き、
// 二重ポーリングが構造的に起きない）。カード状態: processing → done(消える)/failed/timeout。

import { renderHook, waitFor } from "@testing-library/react-native";
import type { ReactNode } from "react";

let mockAuth: { token: string | null; user: { id: string } | null } = {
  token: "tok",
  user: { id: "u1" },
};
jest.mock("./auth", () => ({ useAuth: () => mockAuth }));

const mockPoll = jest.fn<Promise<unknown>, unknown[]>();
const mockSave = jest.fn(() => Promise.resolve());
const mockClear = jest.fn(() => Promise.resolve());
let mockStored: { jobId: string; startedAt: number; seq?: number; userId?: string } | null = null;
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
    mockAuth = { token: "tok", user: { id: "u1" } };
  });

  it("start で userId 付きで永続化して processing カードを出し、done でカードが消え completedCount が増える", async () => {
    mockPoll.mockResolvedValue({ kind: "done", gameId: "g1", logId: "l1" });
    const { result } = renderHook(() => useAnalysisJob(), { wrapper });

    await result.current.start({ jobId: "j1", startedAt: 0, seq: 3 });

    expect(mockSave).toHaveBeenCalledWith({ jobId: "j1", startedAt: 0, seq: 3, userId: "u1" });
    await waitFor(() => expect(result.current.completedCount).toBe(1));
    expect(result.current.card).toBeNull();
    expect(mockClear).toHaveBeenCalled();
  });

  it("ポーリング中の start は false を返し、進行中ジョブの保存枠を上書きしない", async () => {
    let resolvePoll: (v: unknown) => void = () => {};
    mockPoll.mockReturnValue(new Promise((r) => (resolvePoll = r)));
    const { result } = renderHook(() => useAnalysisJob(), { wrapper });

    await result.current.start({ jobId: "j1", startedAt: 0 });
    await waitFor(() => expect(result.current.card).toEqual({ kind: "processing" }));

    const second = await result.current.start({ jobId: "j2", startedAt: 1 });

    expect(second).toBe(false);
    expect(mockSave).toHaveBeenCalledTimes(1); // j2 で j1 の記録を潰さない
    resolvePoll({ kind: "done", gameId: "g1", logId: "l1" });
    await waitFor(() => expect(result.current.completedCount).toBe(1));
  });

  it("cancelled（サインアウト等の中断）はカードを消すが記録は消さない（再ログインで復元可能）", async () => {
    mockPoll.mockResolvedValue({ kind: "cancelled" });
    const { result } = renderHook(() => useAnalysisJob(), { wrapper });

    await result.current.start({ jobId: "j1", startedAt: 0 });

    await waitFor(() => expect(result.current.card).toBeNull());
    expect(mockClear).not.toHaveBeenCalled();
  });

  it("別ユーザーの保存済みジョブは復元せず掃除する（前アカウントのカードを出さない）", async () => {
    mockStored = { jobId: "j9", startedAt: 100, userId: "someone-else" };
    const { result } = renderHook(() => useAnalysisJob(), { wrapper });

    await waitFor(() => expect(mockClear).toHaveBeenCalled());
    expect(mockPoll).not.toHaveBeenCalled();
    expect(result.current.card).toBeNull();
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
    expect(mockPoll).toHaveBeenCalledWith(
      "tok",
      { jobId: "j9", startedAt: 100, seq: 5 },
      undefined,
      expect.any(Function),
    );
  });

  it("Provider の外では不活性な既定値を返す（テスト・未配線画面を壊さない）", () => {
    const { result } = renderHook(() => useAnalysisJob());
    expect(result.current.card).toBeNull();
  });
});
