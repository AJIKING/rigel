import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { KifuSchema, type Kifu } from "@rigel/schema";
import { tileLabel } from "@rigel/ui";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// 認証と API を差し替えてログイン済み＋モック応答にする。
// vi.hoisted で巻き上げ順の問題を避ける（vi.mock ファクトリより先に評価される）。
const h = vi.hoisted(() => ({
  auth: { user: { plan: "free" as const }, token: "tok", loading: false },
  getGame: vi.fn(),
  updateKifu: vi.fn(),
  deleteKifu: vi.fn(),
  setVisibility: vi.fn(),
}));

vi.mock("../../lib/auth-context", () => ({ useAuth: () => h.auth }));
vi.mock("../../lib/api", () => ({
  getGame: h.getGame,
  updateKifu: h.updateKifu,
  deleteKifu: h.deleteKifu,
  setVisibility: h.setVisibility,
}));

import { BoardEditor } from "./BoardEditor";

function makeKifu(): Kifu {
  return KifuSchema.parse({
    schemaVersion: "1.0.0",
    capturedAt: "2026-06-28T00:00:00.000Z",
    cameraBottomSeat: "east", // 手前=東（＝親）。各席の風は 東/南/西/北。
    seats: { east: {}, south: {}, west: {}, north: {} },
    meta: { dealer: "east" },
  });
}

function makeDetail(logs: { id: string }[]) {
  return {
    game: { id: "g1", userId: "u1", title: "テスト卓", createdAt: "2026-06-28T00:00:00.000Z" },
    logs: logs.map((l, i) => ({
      id: l.id,
      userId: "u1",
      gameId: "g1",
      seq: i + 1,
      kifu: makeKifu(),
      visibility: "private" as const,
      createdAt: "2026-06-28T00:00:00.000Z",
    })),
  };
}

beforeEach(() => {
  h.getGame.mockReset().mockResolvedValue(makeDetail([{ id: "l1" }]));
  h.updateKifu.mockReset().mockResolvedValue({ ok: true, status: 200 });
  h.deleteKifu.mockReset().mockResolvedValue({ ok: true, status: 200 });
  h.setVisibility.mockReset().mockResolvedValue({ ok: true, status: 200 });
});
afterEach(() => vi.clearAllTimers());

describe("BoardEditor 編集操作", () => {
  it("手牌に牌を追加して保存すると、その牌が updateKifu の Kifu に乗る", async () => {
    render(<BoardEditor gameId="g1" logId="l1" />);

    // 東家（手前＝親）の手牌に「+」で追加 → 牌ピッカーが開く。
    const addBtn = await screen.findByRole("button", { name: "東家の手牌に追加" });
    fireEvent.click(addBtn);

    const dialog = screen.getByRole("dialog", { name: "牌を選ぶ" });
    // 既定の萬子タブから一萬(1m)を選ぶ。ピッカーの牌ボタンの名前は牌ラベル(=画像alt)。
    fireEvent.click(within(dialog).getByRole("button", { name: tileLabel("1m") }));

    // 追加された手牌が盤面に出る（BoardTile の aria-label）。
    expect(await screen.findByRole("button", { name: "東家の手牌 を編集" })).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "保存" }));

    await waitFor(() => expect(h.updateKifu).toHaveBeenCalled());
    const [token, logId, kifu] = h.updateKifu.mock.calls[0] as [string, string, Kifu];
    expect(token).toBe("tok");
    expect(logId).toBe("l1");
    expect(kifu.seats.east.hand.map((t) => t.tile)).toEqual(["1m"]);
  });

  it("公開範囲を「公開」に切り替えると setVisibility を呼ぶ", async () => {
    render(<BoardEditor gameId="g1" logId="l1" />);
    const pub = await screen.findByRole("button", { name: "公開" });
    fireEvent.click(pub);

    await waitFor(() => expect(h.setVisibility).toHaveBeenCalledWith("tok", "l1", "public"));
    // 公開に変わると共有導線が現れる。
    expect(await screen.findByText(/公開ページを見る/)).toBeTruthy();
  });

  it("局が1つだけなら削除ボタンは無効", async () => {
    render(<BoardEditor gameId="g1" logId="l1" />);
    const del = await screen.findByRole("button", { name: "この局を削除" });
    expect((del as HTMLButtonElement).disabled).toBe(true);
  });

  it("局が複数あるとき、2度押しで deleteKifu を呼ぶ（誤操作防止）", async () => {
    h.getGame.mockResolvedValue(makeDetail([{ id: "l1" }, { id: "l2" }]));
    render(<BoardEditor gameId="g1" logId="l1" />);

    const del = await screen.findByRole("button", { name: "この局を削除" });
    fireEvent.click(del); // 1度目: 武装（確認待ち）
    expect(h.deleteKifu).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "もう一度押して削除" })).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "もう一度押して削除" }));
    await waitFor(() => expect(h.deleteKifu).toHaveBeenCalledWith("tok", "l1"));
  });
});
