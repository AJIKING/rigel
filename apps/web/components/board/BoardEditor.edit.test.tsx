import { KifuSchema, type Kifu } from "@rigel/schema";
import { tileLabel } from "@rigel/ui";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { type GameDetail } from "../../lib/api";

// 認証は Server Component 側（Cookie）が済ませ、BoardEditor は initialDetail を props で
// 受け取る。書き込みは Server Action。ここでは actions をモックして検証する。
// （app/actions は server-only を辿るため、実体は読み込まない。）
const h = vi.hoisted(() => ({
  getGameAction: vi.fn(),
  updateKifuAction: vi.fn(),
  setVisibilityAction: vi.fn(),
  deleteKifuAction: vi.fn(),
  analyzeAction: vi.fn(),
  createEmptyKifuAction: vi.fn(),
  createGameAction: vi.fn(),
  getMyGamesAction: vi.fn(),
  updateProfileAction: vi.fn(),
  createCheckoutAction: vi.fn(),
  deleteAccountAction: vi.fn(),
}));
vi.mock("../../app/actions", () => h);

import { BoardEditor } from "./BoardEditor";

function makeKifu(): Kifu {
  return KifuSchema.parse({
    schemaVersion: "1.0.0",
    capturedAt: "2026-06-28T00:00:00.000Z",
    cameraBottomSeat: "east",
    seats: { east: {}, south: {}, west: {}, north: {} },
    meta: { dealer: "east" },
  });
}

function makeDetail(logs: { id: string }[]): GameDetail {
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
  h.updateKifuAction.mockReset().mockResolvedValue({ ok: true, status: 200 });
  h.setVisibilityAction.mockReset().mockResolvedValue({ ok: true, status: 200 });
  h.deleteKifuAction.mockReset().mockResolvedValue({ ok: true, status: 200 });
  h.getGameAction.mockReset().mockResolvedValue(makeDetail([{ id: "l1" }]));
});

describe("BoardEditor 編集操作", () => {
  it("手牌に牌を追加して保存すると、その牌が updateKifuAction の Kifu に乗る", async () => {
    render(<BoardEditor initialDetail={makeDetail([{ id: "l1" }])} gameId="g1" logId="l1" />);

    fireEvent.click(await screen.findByRole("button", { name: "東家の手牌に追加" }));
    const dialog = screen.getByRole("dialog", { name: "牌を選ぶ" });
    fireEvent.click(within(dialog).getByRole("button", { name: tileLabel("1m") }));

    expect(await screen.findByRole("button", { name: "東家の手牌 を編集" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "保存" }));

    await waitFor(() => expect(h.updateKifuAction).toHaveBeenCalled());
    const [logId, kifu] = h.updateKifuAction.mock.calls[0] as [string, Kifu];
    expect(logId).toBe("l1");
    expect(kifu.seats.east.hand.map((t) => t.tile)).toEqual(["1m"]);
  });

  it("公開範囲を「公開」に切り替えると setVisibilityAction を呼ぶ", async () => {
    render(<BoardEditor initialDetail={makeDetail([{ id: "l1" }])} gameId="g1" logId="l1" />);
    fireEvent.click(await screen.findByRole("button", { name: "公開" }));
    await waitFor(() => expect(h.setVisibilityAction).toHaveBeenCalledWith("l1", "public"));
    expect(await screen.findByText(/公開ページを見る/)).toBeTruthy();
  });

  it("局が1つだけなら削除ボタンは無効", async () => {
    render(<BoardEditor initialDetail={makeDetail([{ id: "l1" }])} gameId="g1" logId="l1" />);
    const del = await screen.findByRole("button", { name: "この局を削除" });
    expect((del as HTMLButtonElement).disabled).toBe(true);
  });

  it("局が複数あるとき、2度押しで deleteKifuAction を呼ぶ（誤操作防止）", async () => {
    render(
      <BoardEditor
        initialDetail={makeDetail([{ id: "l1" }, { id: "l2" }])}
        gameId="g1"
        logId="l1"
      />,
    );
    const del = await screen.findByRole("button", { name: "この局を削除" });
    fireEvent.click(del);
    expect(h.deleteKifuAction).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "もう一度押して削除" }));
    await waitFor(() => expect(h.deleteKifuAction).toHaveBeenCalledWith("l1"));
  });
});
