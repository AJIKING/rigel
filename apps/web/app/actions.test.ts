// Server Action の認証ゲート（requireToken）の特性テスト。
// アクション本体は @rigel/client への薄い委譲なので全数は追わず、
//   - トークンが無ければ api を呼ばずに落ちる（未認証の書き込みを通さない）
//   - トークンは Cookie から取り、そのまま Bearer 用に渡す（クライアントへは渡らない）
//   - 退会成功時だけセッション Cookie を破棄する
// という「ゲートの形」を代表アクションで固定する。

import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  getSessionToken: vi.fn<() => Promise<string | null>>(),
  clearSessionCookie: vi.fn(),
  updateKifu: vi.fn(),
  deleteAccount: vi.fn(),
  getMyGames: vi.fn(),
}));
vi.mock("../lib/session", () => ({
  getSessionToken: h.getSessionToken,
  clearSessionCookie: h.clearSessionCookie,
}));
vi.mock("../lib/api-server", () => ({
  analyze: vi.fn(),
  analyzeProblem: vi.fn(),
  answerProblem: vi.fn(),
  createCheckout: vi.fn(),
  getAnalysisJob: vi.fn(),
  getProblemAnalysisJob: vi.fn(),
  finishQuizSession: vi.fn(),
  listMyFavorites: vi.fn(),
  listQuizSessions: vi.fn(),
  setFavorite: vi.fn(),
  startQuizSession: vi.fn(),
  createPortal: vi.fn(),
  createEmptyKifu: vi.fn(),
  createGame: vi.fn(),
  createProblem: vi.fn(),
  deleteAccount: h.deleteAccount,
  deleteGame: vi.fn(),
  deleteKifu: vi.fn(),
  deleteProblem: vi.fn(),
  getMyGames: h.getMyGames,
  getMyProblems: vi.fn(),
  getProblemStats: vi.fn(),
  setGameStatus: vi.fn(),
  setGameVisibility: vi.fn(),
  updateGame: vi.fn(),
  updateGamePlayers: vi.fn(),
  updateGameRules: vi.fn(),
  updateKifu: h.updateKifu,
  updateProblem: vi.fn(),
  updateProfile: vi.fn(),
}));
vi.mock("../lib/load-game", () => ({ loadGameDetail: vi.fn() }));

import { deleteAccountAction, getMyGamesAction, updateKifuAction } from "./actions";

beforeEach(() => {
  h.getSessionToken.mockReset().mockResolvedValue("tok-1");
  h.clearSessionCookie.mockReset();
  h.updateKifu.mockReset();
  h.deleteAccount.mockReset();
  h.getMyGames.mockReset().mockResolvedValue([]);
});

describe("Server Action の認証ゲート（requireToken）", () => {
  it("Cookie にトークンが無ければ api を呼ばずに unauthorized で落ちる", async () => {
    h.getSessionToken.mockResolvedValue(null);
    await expect(getMyGamesAction()).rejects.toThrow("unauthorized");
    expect(h.getMyGames).not.toHaveBeenCalled();
  });

  it("トークンは Cookie から取り、そのまま api クライアントへ渡す（書き込みの代表 = updateKifu）", async () => {
    h.updateKifu.mockResolvedValue({ ok: true, status: 200 });
    await updateKifuAction("log-1", { schemaVersion: "1.0.0" } as never, 2);
    expect(h.updateKifu).toHaveBeenCalledWith("tok-1", "log-1", { schemaVersion: "1.0.0" }, 2);
  });
});

describe("deleteAccountAction（退会）", () => {
  it("退会成功でセッション Cookie を破棄する（消えたアカウントのセッションを残さない）", async () => {
    h.deleteAccount.mockResolvedValue({ ok: true, status: 200 });
    const res = await deleteAccountAction();
    expect(res.ok).toBe(true);
    expect(h.clearSessionCookie).toHaveBeenCalledTimes(1);
  });

  it("退会失敗では Cookie を消さない（再試行できるように）", async () => {
    h.deleteAccount.mockResolvedValue({ ok: false, status: 500 });
    const res = await deleteAccountAction();
    expect(res.ok).toBe(false);
    expect(h.clearSessionCookie).not.toHaveBeenCalled();
  });
});
