import type { GameDetail } from "@rigel/client";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AuthProvider } from "../../lib/auth-context";
import { stubMe } from "../problem/test-helpers";

const h = vi.hoisted(() => ({
  getGameAction: vi.fn(),
  updateGameAction: vi.fn(),
  retryAnalysisAction: vi.fn(),
  deleteGameAction: vi.fn(),
  analyzeAction: vi.fn(),
  getAnalysisJobAction: vi.fn(),
  createEmptyKifuAction: vi.fn(),
  createGameAction: vi.fn(),
  getGamePhotosAction: vi.fn(() => Promise.resolve([])),
}));
vi.mock("../../app/actions", () => h);
const nav = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => nav }));
// 解析追従 Provider はモック（retry→追従開始・busy ガードを観測する）。
const aj = vi.hoisted(() => ({ settledCount: 0, busy: false, start: vi.fn() }));
vi.mock("../../lib/use-analysis-job", () => ({ useAnalysisJob: () => aj }));

import { GameHeaderScreen } from "./GameHeaderScreen";

/** 0局の半荘詳細（解析中/失敗のヘッダビューが対象とする形）。 */
function detail0(over: Partial<GameDetail> = {}): GameDetail {
  return {
    game: {
      id: "g1",
      title: "テスト半荘",
      createdAt: "2026-08-01T00:00:00.000Z",
    } as GameDetail["game"],
    logs: [],
    favoriteCount: 0,
    viewerFaved: false,
    analysisStatus: "processing",
    analysisJobId: "j1",
    ...over,
  };
}

function renderScreen(d: GameDetail) {
  return render(
    <AuthProvider>
      <GameHeaderScreen gameId="g1" initial={d} />
    </AuthProvider>,
  );
}

beforeEach(() => {
  stubMe("next");
  nav.push.mockReset();
  nav.replace.mockReset();
  aj.busy = false;
  aj.start.mockReset();
  h.getGameAction.mockReset().mockResolvedValue(null);
  h.updateGameAction.mockReset().mockResolvedValue({ ok: true });
  h.retryAnalysisAction.mockReset().mockResolvedValue({ ok: true, jobId: "j1", gameId: "g1" });
  h.deleteGameAction.mockReset().mockResolvedValue({ ok: true });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("GameHeaderScreen（0局の半荘ヘッダビュー。Phase C）", () => {
  it("解析中の案内と半荘メタ（名前・日付・元写真・局追加・削除）を出す", async () => {
    renderScreen(detail0());
    expect(await screen.findByText(/AI解析中です/)).toBeTruthy();
    expect((screen.getByLabelText("半荘名") as HTMLInputElement).value).toBe("テスト半荘");
    expect((screen.getByLabelText("対局日") as HTMLInputElement).value).toBe("2026-08-01");
    expect(screen.getByRole("button", { name: "＋ 局を追加" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "元写真" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "半荘を削除" })).toBeTruthy();
  });

  it("半荘名は blur で保存する（未変更なら送らない）", async () => {
    renderScreen(detail0());
    const input = await screen.findByLabelText("半荘名");

    fireEvent.blur(input); // 未変更
    expect(h.updateGameAction).not.toHaveBeenCalled();

    fireEvent.change(input, { target: { value: "新しい名前" } });
    fireEvent.blur(input);
    await waitFor(() =>
      expect(h.updateGameAction).toHaveBeenCalledWith("g1", { title: "新しい名前" }),
    );
  });

  it("解析失敗なら「もう一度解析」を出し、202 で Provider に追わせて解析中表示へ", async () => {
    renderScreen(detail0({ analysisStatus: "failed" }));
    expect(await screen.findByText("解析に失敗しました。")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "もう一度解析" }));
    await waitFor(() => expect(h.retryAnalysisAction).toHaveBeenCalledWith("j1"));
    expect(aj.start).toHaveBeenCalledWith({ jobId: "j1", startedAt: expect.any(Number) });
    expect(await screen.findByText(/AI解析中です/)).toBeTruthy();
  });

  it("別の解析が進行中（busy）なら再解析を送らず「ひとつずつ」の案内を出す", async () => {
    aj.busy = true;
    renderScreen(detail0({ analysisStatus: "failed" }));
    await screen.findByText("解析に失敗しました。");

    fireEvent.click(screen.getByRole("button", { name: "もう一度解析" }));

    expect(await screen.findByText(/解析はひとつずつ実行できます/)).toBeTruthy();
    expect(h.retryAnalysisAction).not.toHaveBeenCalled();
  });

  it("局ができたらエディタへ replace する（解析完了の refetch 後）", async () => {
    renderScreen(
      detail0({
        logs: [{ id: "l1" } as GameDetail["logs"][number]],
        analysisStatus: null,
      }),
    );
    await waitFor(() => expect(nav.replace).toHaveBeenCalledWith("/kifu/g1/l1"));
  });

  it("削除は確認のうえ実行し、マイページへ戻る（文言は DELETE_CONFIRM）", async () => {
    const confirm = vi.fn().mockReturnValueOnce(false).mockReturnValueOnce(true);
    vi.stubGlobal("confirm", confirm);
    renderScreen(detail0());
    await screen.findByText(/AI解析中です/);

    fireEvent.click(screen.getByRole("button", { name: "半荘を削除" }));
    expect(h.deleteGameAction).not.toHaveBeenCalled(); // キャンセル

    fireEvent.click(screen.getByRole("button", { name: "半荘を削除" }));
    await waitFor(() => expect(h.deleteGameAction).toHaveBeenCalledWith("g1"));
    await waitFor(() => expect(nav.push).toHaveBeenCalledWith("/mypage"));
    expect(confirm.mock.calls[0]![0]).toContain("元写真");
  });
});
