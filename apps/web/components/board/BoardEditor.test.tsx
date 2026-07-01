import { KifuSchema, type Kifu } from "@rigel/schema";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { type GameDetail } from "../../lib/api";

// app/actions は server-only を辿るのでモックする（描画テストでは呼ばれない）。
vi.mock("../../app/actions", () => ({
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

import { BoardEditor } from "./BoardEditor";

function kifu(): Kifu {
  return KifuSchema.parse({
    schemaVersion: "1.0.0",
    capturedAt: "2026-06-28T00:00:00.000Z",
    cameraBottomSeat: "east",
    seats: { east: {}, south: {}, west: {}, north: {} },
    meta: { dealer: "east" },
  });
}

function detail(logs: { id: string }[]): GameDetail {
  return {
    game: { id: "g1", userId: "u1", title: "テスト卓", createdAt: "2026-06-28T00:00:00.000Z" },
    logs: logs.map((l, i) => ({
      id: l.id,
      userId: "u1",
      gameId: "g1",
      seq: i + 1,
      kifu: kifu(),
      visibility: "private" as const,
      createdAt: "2026-06-28T00:00:00.000Z",
    })),
  };
}

describe("BoardEditor", () => {
  it("initialDetail から盤面を描画し、『読み込み中』を出さない", () => {
    render(<BoardEditor initialDetail={detail([{ id: "l1" }])} gameId="g1" logId="l1" />);
    // 盤面（ダーク themeBoard）が即座に描画される。
    expect(document.querySelector(".themeBoard")).toBeTruthy();
    expect(screen.getByRole("button", { name: "保存" })).toBeTruthy();
    expect(screen.queryByText(/読み込み中/)).toBeNull();
  });

  it("局が無い半荘は空である旨を案内する", () => {
    render(<BoardEditor initialDetail={detail([])} gameId="g1" logId="x" />);
    expect(screen.getByText(/局がありません/)).toBeTruthy();
  });
});
