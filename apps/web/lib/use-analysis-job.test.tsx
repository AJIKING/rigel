import { act, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { stubMe } from "../components/problem/test-helpers";
import { AuthProvider, useAuth } from "./auth-context";

const h = vi.hoisted(() => ({
  getAnalysisJobAction: vi.fn(),
}));
vi.mock("../app/actions", () => h);

import { AnalysisJobProvider, useAnalysisJob, type PendingAnalysis } from "./use-analysis-job";

const STORAGE_KEY = "rigel:pendingAnalysis";

/** Provider の値を画面に晒すテスト用コンシューマ（start はボタンで発火）。 */
function Probe({ pending }: { pending: PendingAnalysis }) {
  const { settledCount, busy, start } = useAnalysisJob();
  const { user } = useAuth();
  return (
    <div>
      <span data-testid="settled">{settledCount}</span>
      <span data-testid="busy">{String(busy)}</span>
      <span data-testid="user">{user?.id ?? "-"}</span>
      <button
        onClick={() => {
          const ok = start(pending);
          document.title = `start:${ok}`;
        }}
      >
        start
      </button>
    </div>
  );
}

function renderProbe(pending: PendingAnalysis = { jobId: "job-1", startedAt: Date.now() }) {
  return render(
    <AuthProvider>
      <AnalysisJobProvider>
        <Probe pending={pending} />
      </AnalysisJobProvider>
    </AuthProvider>,
  );
}

beforeEach(() => {
  window.localStorage.clear();
  h.getAnalysisJobAction.mockReset();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("AnalysisJobProvider（web の解析追従。docs/plans/web-mobile-parity.md Phase B）", () => {
  it("start で busy になり、done で settledCount が増えて busy が解ける（記録も掃除）", async () => {
    stubMe("next");
    h.getAnalysisJobAction.mockResolvedValue({
      id: "job-1",
      status: "done",
      gameId: "g1",
      logId: "l1",
      reason: null,
    });
    renderProbe();
    await screen.findByText("start");

    act(() => {
      screen.getByText("start").click();
    });
    expect(document.title).toBe("start:true");

    await waitFor(() => expect(screen.getByTestId("settled").textContent).toBe("1"));
    expect(screen.getByTestId("busy").textContent).toBe("false");
    expect(window.localStorage.getItem(STORAGE_KEY)).toBeNull();
  });

  it("進行中の start は false で拒否する（解析はひとつずつ）", async () => {
    stubMe("next");
    // 終端に達しない processing を返し続ける（ポーリング中のまま2回目を打つ）。
    h.getAnalysisJobAction.mockResolvedValue({
      id: "job-1",
      status: "processing",
      gameId: null,
      logId: null,
      reason: null,
    });
    const { unmount } = renderProbe();
    await screen.findByText("start");

    act(() => {
      screen.getByText("start").click();
    });
    expect(document.title).toBe("start:true");
    await waitFor(() => expect(screen.getByTestId("busy").textContent).toBe("true"));

    act(() => {
      screen.getByText("start").click();
    });
    expect(document.title).toBe("start:false");
    unmount(); // ポーリングを打ち切る（テストプロセスに残さない）
  });

  it("start はユーザーIDつきで localStorage に永続化する（リロード復元用）", async () => {
    stubMe("next");
    // 終端に達しない processing のまま、永続化された記録を覗く。
    h.getAnalysisJobAction.mockResolvedValue({
      id: "job-1",
      status: "processing",
      gameId: null,
      logId: null,
      reason: null,
    });
    const { unmount } = renderProbe({ jobId: "job-1", startedAt: 123 });
    // userId を記録に載せるため、AuthProvider がユーザーを読み終わるまで待つ。
    await waitFor(() => expect(screen.getByTestId("user").textContent).toBe("u1"));

    act(() => {
      screen.getByText("start").click();
    });

    const raw = window.localStorage.getItem(STORAGE_KEY);
    expect(raw).not.toBeNull();
    expect(JSON.parse(raw!)).toEqual({ jobId: "job-1", startedAt: 123, userId: "u1" });
    unmount(); // ポーリングを打ち切る（記録は残る＝次の訪問で復元される）
  });

  it("リロード後、同じユーザーなら localStorage から復元してポーリングする", async () => {
    stubMe("next");
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ jobId: "job-9", startedAt: Date.now(), userId: "u1" }),
    );
    h.getAnalysisJobAction.mockResolvedValue({
      id: "job-9",
      status: "done",
      gameId: "g1",
      logId: "l1",
      reason: null,
    });
    renderProbe();

    await waitFor(() => expect(screen.getByTestId("settled").textContent).toBe("1"));
    expect(h.getAnalysisJobAction).toHaveBeenCalledWith("job-9");
    expect(window.localStorage.getItem(STORAGE_KEY)).toBeNull();
  });

  it("別ユーザーの残骸は復元せず破棄する", async () => {
    stubMe("next");
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ jobId: "job-9", startedAt: Date.now(), userId: "someone-else" }),
    );
    renderProbe();
    await screen.findByText("start");

    await waitFor(() => expect(window.localStorage.getItem(STORAGE_KEY)).toBeNull());
    expect(h.getAnalysisJobAction).not.toHaveBeenCalled();
    expect(screen.getByTestId("busy").textContent).toBe("false");
  });

  it("failed でも settledCount が増える（一覧の失敗バッジを refetch で見せる）", async () => {
    stubMe("next");
    h.getAnalysisJobAction.mockResolvedValue({
      id: "job-1",
      status: "failed",
      gameId: null,
      logId: null,
      reason: "quota_exceeded",
    });
    renderProbe();
    await screen.findByText("start");

    act(() => {
      screen.getByText("start").click();
    });

    await waitFor(() => expect(screen.getByTestId("settled").textContent).toBe("1"));
    expect(screen.getByTestId("busy").textContent).toBe("false");
  });
});
