import { KifuSchema, type Kifu } from "@rigel/schema";
import { describe, expect, it } from "vitest";
import {
  addHandTile,
  addMeld,
  addRiverTile,
  meldTiles,
  NUMS,
  removeHandTile,
  removeMeld,
  removeRiverTile,
  setDiscardFlags,
  SUITS,
} from "./edit";

function kifu(seats: Record<string, unknown> = {}): Kifu {
  return KifuSchema.parse({
    schemaVersion: "1.0.0",
    capturedAt: "2026-07-04T00:00:00.000Z",
    cameraBottomSeat: "east",
    seats: { east: {}, south: {}, west: {}, north: {}, ...seats },
  });
}

describe("addHandTile / removeHandTile", () => {
  it("手牌に確定(confidence=1)で追加し、元は不変", () => {
    const k = kifu();
    const next = addHandTile(k, "east", "1m");
    expect(next.seats.east.hand).toEqual([{ tile: "1m", confidence: 1 }]);
    expect(k.seats.east.hand).toHaveLength(0);
  });
  it("指定位置の手牌を取り除く", () => {
    const k = addHandTile(addHandTile(kifu(), "east", "1m"), "east", "2m");
    const next = removeHandTile(k, "east", 0);
    expect(next.seats.east.hand.map((t) => t.tile)).toEqual(["2m"]);
  });
});

describe("addRiverTile / removeRiverTile", () => {
  it("河に order 連番で追加する", () => {
    const k = addRiverTile(addRiverTile(kifu(), "east", "1z"), "east", "2z");
    expect(k.seats.east.river.map((d) => d.order)).toEqual([1, 2]);
    expect(k.seats.east.river[1]).toMatchObject({
      tile: "2z",
      riichi: false,
      tsumogiri: false,
      confidence: 1,
    });
  });
  it("取り除いたら order を 1..n に振り直す（連番を壊さない）", () => {
    let k = kifu();
    for (const t of ["1z", "2z", "3z"] as const) k = addRiverTile(k, "east", t);
    const next = removeRiverTile(k, "east", 1); // 2z を削除
    expect(next.seats.east.river.map((d) => d.tile)).toEqual(["1z", "3z"]);
    expect(next.seats.east.river.map((d) => d.order)).toEqual([1, 2]);
  });
});

describe("setDiscardFlags", () => {
  it("リーチ/ツモ切りを指定した項目だけ切り替える", () => {
    const k = addRiverTile(kifu(), "east", "5p");
    const withRiichi = setDiscardFlags(k, "east", 0, { riichi: true });
    expect(withRiichi.seats.east.river[0]).toMatchObject({ riichi: true, tsumogiri: false });
    const withTsumogiri = setDiscardFlags(withRiichi, "east", 0, { tsumogiri: true });
    expect(withTsumogiri.seats.east.river[0]).toMatchObject({ riichi: true, tsumogiri: true });
  });
});

describe("addMeld / removeMeld", () => {
  it("ポンは同牌3枚・カンは同牌4枚（kan は kan_open）", () => {
    const pon = addMeld(kifu(), "south", "pon", "5p");
    expect(pon.seats.south.melds[0]?.type).toBe("pon");
    expect(pon.seats.south.melds[0]?.tiles.map((t) => t.tile)).toEqual(["5p", "5p", "5p"]);
    const kan = addMeld(kifu(), "south", "kan", "1z");
    expect(kan.seats.south.melds[0]?.type).toBe("kan_open");
    expect(kan.seats.south.melds[0]?.tiles).toHaveLength(4);
  });
  it("カンは種別（大明槓/暗槓/加槓）を指定できる。すべて4枚", () => {
    for (const type of ["kan_open", "kan_closed", "kan_added"] as const) {
      const kan = addMeld(kifu(), "south", type, "3m");
      expect(kan.seats.south.melds[0]?.type).toBe(type);
      expect(kan.seats.south.melds[0]?.tiles.map((t) => t.tile)).toEqual(["3m", "3m", "3m", "3m"]);
    }
  });
  it("チーは選択牌を含む3連続（字牌は同牌3枚にフォールバック）", () => {
    const chi = addMeld(kifu(), "south", "chi", "3m");
    expect(chi.seats.south.melds[0]?.tiles.map((t) => t.tile)).toEqual(["2m", "3m", "4m"]);
    const zi = addMeld(kifu(), "south", "chi", "7z");
    expect(zi.seats.south.melds[0]?.tiles.map((t) => t.tile)).toEqual(["7z", "7z", "7z"]);
  });
  it("鳴きを丸ごと取り除く", () => {
    const k = addMeld(addMeld(kifu(), "south", "pon", "5p"), "south", "pon", "6p");
    const next = removeMeld(k, "south", 0);
    expect(next.seats.south.melds.map((m) => m.tiles[0]?.tile)).toEqual(["6p"]);
  });
});

describe("meldTiles / SUITS / NUMS（ピッカー素材）", () => {
  it("meldTiles: チーは 1-9 に収める（端は寄せる）", () => {
    expect(meldTiles("chi", "1m")).toEqual(["1m", "2m", "3m"]);
    expect(meldTiles("chi", "9s")).toEqual(["7s", "8s", "9s"]);
    expect(meldTiles("chi", "0p")).toEqual(["4p", "5p", "6p"]); // 赤5は5扱い
  });
  it("SUITS は 萬筒索字、NUMS は数牌に赤ドラを含み字牌は7種", () => {
    expect(SUITS.map((s) => s.suit)).toEqual(["m", "p", "s", "z"]);
    expect(NUMS.m).toContain("0m");
    expect(NUMS.z).toHaveLength(7);
  });
});
