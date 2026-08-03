// マイ何切るの解析下書きセクション（photo-retention.md）。
// ready はタップで編集へ / 解析中・失敗はタップで案内 / 破棄は確認つきで写真ごと消える。

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AuthProvider } from "../../lib/auth-context";
import { stubMe } from "./test-helpers";

const h = vi.hoisted(() => ({
  updateProblemAction: vi.fn(),
  deleteProblemAction: vi.fn(),
  setFavoriteAction: vi.fn(),
  getProblemDraftsAction: vi.fn(),
  deleteProblemDraftAction: vi.fn(),
}));
vi.mock("../../app/actions", () => h);
const push = vi.hoisted(() => vi.fn());
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));

import { MyProblemsScreen } from "./MyProblemsScreen";

function renderScreen() {
  return render(
    <AuthProvider>
      <MyProblemsScreen initialPosts={[]} />
    </AuthProvider>,
  );
}

beforeEach(() => {
  push.mockReset();
  h.getProblemDraftsAction.mockReset().mockResolvedValue([]);
  h.deleteProblemDraftAction.mockReset().mockResolvedValue({ ok: true, status: 200 });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("MyProblemsScreen の解析下書き", () => {
  it("解析完了（ready）の下書きはタップで編集画面（?draft=）へ", async () => {
    stubMe("next");
    h.getProblemDraftsAction.mockResolvedValue([
      { id: "d-1", status: "ready", createdAt: "2026-08-03T00:00:00.000Z" },
    ]);
    renderScreen();

    expect(await screen.findByText("解析完了")).toBeTruthy();
    fireEvent.click(screen.getByText("解析下書き"));
    expect(push).toHaveBeenCalledWith("/problems/new?draft=d-1");
  });

  it("解析中の下書きはタップで案内を出し、遷移しない", async () => {
    stubMe("next");
    h.getProblemDraftsAction.mockResolvedValue([
      { id: "d-1", status: "processing", createdAt: "2026-08-03T00:00:00.000Z" },
    ]);
    renderScreen();

    expect(await screen.findByText("解析中")).toBeTruthy();
    fireEvent.click(screen.getByText("解析下書き"));
    expect(push).not.toHaveBeenCalled();
    expect(screen.getByText(/解析中です/)).toBeTruthy();
  });

  it("破棄は確認のうえで一覧から消す（写真も消える旨を明示）", async () => {
    stubMe("next");
    const confirm = vi.fn(() => true);
    vi.stubGlobal("confirm", confirm);
    h.getProblemDraftsAction.mockResolvedValue([
      { id: "d-1", status: "failed", createdAt: "2026-08-03T00:00:00.000Z" },
    ]);
    renderScreen();
    expect(await screen.findByText("解析失敗")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "破棄" }));

    expect(confirm).toHaveBeenCalledWith(expect.stringContaining("写真も削除"));
    await waitFor(() => expect(h.deleteProblemDraftAction).toHaveBeenCalledWith("d-1"));
    await waitFor(() => expect(screen.queryByText("解析下書き")).toBeNull());
  });

  it("下書きの取得失敗は「下書きなし」に化けさせずエラーを出す", async () => {
    stubMe("next");
    h.getProblemDraftsAction.mockRejectedValue(new Error("network"));
    renderScreen();

    expect(await screen.findByText(/解析下書きを読み込めませんでした/)).toBeTruthy();
  });
});
