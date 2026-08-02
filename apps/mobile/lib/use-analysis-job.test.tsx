// 解析ジョブのグローバル状態（docs/plans/async-analysis.md 8-3）。
// 表示はサーバーのバッジ（analysisStatus）が真実源。Provider はポーリング・復元・
// refetch トリガ（settledCount）・多重 start 拒否・サインアウト中断を担う。

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

  it("start で userId 付きで永続化し、done で記録を掃除して settledCount が増える", async () => {
    mockPoll.mockResolvedValue({ kind: "done", gameId: "g1", logId: "l1" });
    const { result } = renderHook(() => useAnalysisJob(), { wrapper });

    await result.current.start({ jobId: "j1", startedAt: 0, seq: 3 });

    expect(mockSave).toHaveBeenCalledWith({ jobId: "j1", startedAt: 0, seq: 3, userId: "u1" });
    await waitFor(() => expect(result.current.settledCount).toBe(1));
    expect(mockClear).toHaveBeenCalled();
  });

  it("failed / timeout でも settledCount が増える（サーバーのバッジを一覧に反映させる）", async () => {
    mockPoll.mockResolvedValue({ kind: "failed", message: "x" });
    const { result } = renderHook(() => useAnalysisJob(), { wrapper });

    await result.current.start({ jobId: "j1", startedAt: 0 });

    await waitFor(() => expect(result.current.settledCount).toBe(1));
    expect(mockClear).toHaveBeenCalled();
  });

  it("ポーリング中の start は false を返し、進行中ジョブの保存枠を上書きしない", async () => {
    let resolvePoll: (v: unknown) => void = () => {};
    mockPoll.mockReturnValue(new Promise((r) => (resolvePoll = r)));
    const { result } = renderHook(() => useAnalysisJob(), { wrapper });

    await result.current.start({ jobId: "j1", startedAt: 0 });
    await waitFor(() => expect(mockPoll).toHaveBeenCalled());

    const second = await result.current.start({ jobId: "j2", startedAt: 1 });

    expect(second).toBe(false);
    expect(mockSave).toHaveBeenCalledTimes(1); // j2 で j1 の記録を潰さない
    resolvePoll({ kind: "done", gameId: "g1", logId: "l1" });
    await waitFor(() => expect(result.current.settledCount).toBe(1));
  });

  it("cancelled（サインアウト等の中断）は記録を消さず settledCount も増やさない", async () => {
    mockPoll.mockResolvedValue({ kind: "cancelled" });
    const { result } = renderHook(() => useAnalysisJob(), { wrapper });

    await result.current.start({ jobId: "j1", startedAt: 0 });

    await waitFor(() => expect(mockPoll).toHaveBeenCalled());
    expect(mockClear).not.toHaveBeenCalled();
    expect(result.current.settledCount).toBe(0);
  });

  it("マウント時に保存済みジョブがあれば復元してポーリングする（開き直し）", async () => {
    mockStored = { jobId: "j9", startedAt: 100, seq: 5 };
    mockPoll.mockResolvedValue({ kind: "done", gameId: "g9", logId: "l9" });
    const { result } = renderHook(() => useAnalysisJob(), { wrapper });

    await waitFor(() => expect(result.current.settledCount).toBe(1));
    expect(mockPoll).toHaveBeenCalledWith(
      "tok",
      { jobId: "j9", startedAt: 100, seq: 5 },
      undefined,
      expect.any(Function),
    );
  });

  it("別ユーザーの保存済みジョブは復元せず掃除する（前アカウントの状態を引き継がない）", async () => {
    mockStored = { jobId: "j9", startedAt: 100, userId: "someone-else" };
    renderHook(() => useAnalysisJob(), { wrapper });

    await waitFor(() => expect(mockClear).toHaveBeenCalled());
    expect(mockPoll).not.toHaveBeenCalled();
  });

  it("Provider の外では不活性な既定値を返す（テスト・未配線画面を壊さない）", async () => {
    const { result } = renderHook(() => useAnalysisJob());
    expect(await result.current.start({ jobId: "x", startedAt: 0 })).toBe(false);
  });
});
