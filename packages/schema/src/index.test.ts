import { describe, it, expect } from "vitest";
import {
  AiRiverResponseSchema,
  KifuSchema,
  ReadTileSchema,
  SeatSchema,
  toAbsoluteSeat,
  type CameraSeat,
  type Seat,
} from "./index";

describe("ReadTileSchema（牌＋確信度）", () => {
  it("confidence を省略すると 1.0 になる", () => {
    expect(ReadTileSchema.parse({ tile: "1m" })).toEqual({ tile: "1m", confidence: 1 });
  });

  it("読めなかった牌は null を許容する", () => {
    expect(ReadTileSchema.parse({ tile: null, confidence: 0 }).tile).toBeNull();
  });
});

describe("AiRiverResponseSchema（河1方向のAI出力検証）", () => {
  it("不正な牌コードを拒否する", () => {
    const result = AiRiverResponseSchema.safeParse({
      discards: [{ order: 1, tile: "10m" }],
    });
    expect(result.success).toBe(false);
  });

  it("null スロットを保持しても枚数・順序が壊れない（推測で埋めない）", () => {
    const result = AiRiverResponseSchema.parse({
      discards: [
        { order: 1, tile: null, confidence: 0 },
        { order: 2, tile: "9p" },
      ],
    });
    expect(result.discards).toHaveLength(2);
    expect(result.discards[0]).toMatchObject({ order: 1, tile: null });
    // riichi / confidence のデフォルトが効く
    expect(result.discards[1]).toMatchObject({
      order: 2,
      tile: "9p",
      riichi: false,
      confidence: 1,
    });
  });

  it("横向き牌は riichi:true で表せる", () => {
    const result = AiRiverResponseSchema.parse({
      discards: [{ order: 1, tile: "3z", riichi: true }],
    });
    expect(result.discards[0]?.riichi).toBe(true);
  });

  it("捨て方は tsumogiri で表す（既定は手出し=false）", () => {
    const result = AiRiverResponseSchema.parse({
      discards: [
        { order: 1, tile: "1m" },
        { order: 2, tile: "2p", tsumogiri: true },
      ],
    });
    expect(result.discards[0]?.tsumogiri).toBe(false); // 既定=手出し
    expect(result.discards[1]?.tsumogiri).toBe(true); // 自摸切り
  });
});

describe("KifuSchema（牌譜1件の最終検証）", () => {
  const minimalKifu = {
    schemaVersion: "1.0.0",
    capturedAt: "2026-06-28T00:00:00.000Z",
    seats: { east: {}, south: {}, west: {}, north: {} },
  };

  it("最小構成の牌譜を受理し、各席に空の盤面デフォルトが入る", () => {
    const kifu = KifuSchema.parse(minimalKifu);
    expect(kifu.seats.east).toEqual({ hand: [], melds: [], river: [] });
    expect(kifu.result).toBeNull();
  });

  it("schemaVersion が一致しないと拒否する", () => {
    const result = KifuSchema.safeParse({ ...minimalKifu, schemaVersion: "9.9.9" });
    expect(result.success).toBe(false);
  });
});

describe("toAbsoluteSeat（カメラ相対→絶対席）", () => {
  const cameras: CameraSeat[] = ["bottom", "right", "top", "left"];
  const seats: Seat[] = SeatSchema.options;

  it.each(seats)("bottom は撮影時の手前席(%s)そのもの", (bottom) => {
    expect(toAbsoluteSeat("bottom", bottom)).toBe(bottom);
  });

  it.each(seats)("手前が %s のとき4方向は4席への全単射（重複なし）", (bottom) => {
    const mapped = cameras.map((c) => toAbsoluteSeat(c, bottom));
    expect(new Set(mapped).size).toBe(4);
  });

  // ⚠️【未確定／要実機検証】right/top/left → 南/西/北 の具体的な対応は CAMERA_ORDER の
  // 回転方向に依存する。東家を手前に置いた実写真で目視確認してから期待値を確定し、ここを埋める。
  // 確定するまで具体値を焼き付けない（自分たちの開発ガイドの規律）。
  it.todo("手前=東のとき right/top/left が 南/西/北 に対応する（実機確認後に確定）");
});
