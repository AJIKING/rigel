import { KifuSchema, type Kifu } from "@rigel/schema";
import { tileLabel } from "@rigel/ui";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { type GameDetail } from "../../lib/api";

// BoardEditor.edit.test.tsx と同じ流儀：actions をモックし、保存ペイロードで挙動を検証する。
const h = vi.hoisted(() => ({
  getGameAction: vi.fn(),
  updateKifuAction: vi.fn(),
  setGameVisibilityAction: vi.fn(),
  deleteKifuAction: vi.fn(),
  analyzeAction: vi.fn(),
  createEmptyKifuAction: vi.fn(),
  createGameAction: vi.fn(),
  getMyGamesAction: vi.fn(),
  updateProfileAction: vi.fn(),
  createCheckoutAction: vi.fn(),
  deleteAccountAction: vi.fn(),
  updateGameAction: vi.fn(),
  updateGameRulesAction: vi.fn(),
  updateGamePlayersAction: vi.fn(),
  deleteGameAction: vi.fn(),
}));
vi.mock("../../app/actions", () => h);
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));

import { BoardEditor } from "./BoardEditor";

/** 撮影者=東固定・親だけ変えられる局。席の識別は選手名で行う（風は親に relative なため）。 */
function makeKifu(dealer: "east" | "south" | "west" | "north"): Kifu {
  return KifuSchema.parse({
    schemaVersion: "1.0.0",
    capturedAt: "2026-06-28T00:00:00.000Z",
    cameraBottomSeat: "east",
    seats: { east: {}, south: {}, west: {}, north: {} },
    meta: { dealer },
    players: {
      east: { name: "東太郎", points: 0 },
      south: { name: "南次郎", points: 0 },
      west: { name: "西三郎", points: 0 },
      north: { name: "北四郎", points: 0 },
    },
  });
}

function makeDetail(dealer: "east" | "south" | "west" | "north"): GameDetail {
  return {
    game: { id: "g1", userId: "u1", title: "テスト卓", createdAt: "2026-06-28T00:00:00.000Z" },
    favoriteCount: 0,
    viewerFaved: false,
    logs: [
      {
        id: "l1",
        userId: "u1",
        gameId: "g1",
        seq: 1,
        kifu: makeKifu(dealer),
        visibility: "private" as const,
        status: "complete" as const,
        createdAt: "2026-06-28T00:00:00.000Z",
      },
    ],
  };
}

beforeEach(() => {
  h.updateKifuAction.mockReset().mockResolvedValue({ ok: true, status: 200 });
  h.getGameAction.mockReset().mockResolvedValue(makeDetail("south"));
});

function bottomPlate(container: HTMLElement): string {
  return container.querySelector('[data-seat="bottom"]')!.textContent as string;
}

describe("BoardEditor 視点（手前の席）", () => {
  it("既定は親が手前（親が南家の局は南家の選手が手前に来る）", async () => {
    const { container } = render(
      <BoardEditor initialDetail={makeDetail("south")} gameId="g1" logId="l1" />,
    );
    await screen.findByRole("button", { name: "保存" });
    // 親（南家の選手）が手前。風表記は親=東。撮影者（東太郎）は手前から外れる。
    expect(bottomPlate(container)).toContain("南次郎");
    expect(bottomPlate(container)).toContain("東");
    expect(bottomPlate(container)).not.toContain("東太郎");
  });

  it("ネームプレートで視点を切り替えられる（選んだ席が手前へ回る）", async () => {
    const { container } = render(
      <BoardEditor initialDetail={makeDetail("south")} gameId="g1" logId="l1" />,
    );
    await screen.findByRole("button", { name: "保存" });
    // 親=南家なので東家（撮影者）の風は北。その視点へ切り替えると東太郎が手前に回る。
    fireEvent.click(screen.getByLabelText("北家の視点にする"));
    expect(bottomPlate(container)).toContain("東太郎");
  });

  it("視点を回しても編集は絶対席に乗る（親=南家が手前のとき、手前への配牌追加は south に保存）", async () => {
    render(<BoardEditor initialDetail={makeDetail("south")} gameId="g1" logId="l1" />);
    // 手前=南家（風は東）。「東家の配牌に追加」は南家の席に足される。
    fireEvent.click(await screen.findByRole("button", { name: "東家の配牌に追加" }));
    const dialog = screen.getByRole("dialog", { name: "牌を選ぶ" });
    fireEvent.click(within(dialog).getByRole("button", { name: tileLabel("1m") }));

    fireEvent.click(screen.getByRole("button", { name: "保存" }));
    await waitFor(() => expect(h.updateKifuAction).toHaveBeenCalled());
    const [, kifu] = h.updateKifuAction.mock.calls[0] as [string, Kifu];
    expect(kifu.seats.south.hand.map((t) => t.tile)).toEqual(["1m"]);
    expect(kifu.seats.east.hand).toEqual([]);
  });
});
