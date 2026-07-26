import { KifuSchema, toAbsoluteSeat, type Kifu, type Seat, type Tile } from "@rigel/schema";
import { describe, expect, it } from "vitest";
import {
  cameraSeatOf,
  chunk,
  handIndexAfterEdit,
  meldTiles,
  roundName,
  shimochaOf,
  windOf,
} from "./board";

describe("meldTiles", () => {
  it("ポンは同じ牌を3枚", () => {
    expect(meldTiles("pon", "3p")).toEqual(["3p", "3p", "3p"]);
  });
  it("カンは同じ牌を4枚", () => {
    expect(meldTiles("kan", "1z")).toEqual(["1z", "1z", "1z", "1z"]);
  });
  it("チーは選択牌を含む3連続", () => {
    expect(meldTiles("chi", "3m")).toEqual(["2m", "3m", "4m"]);
  });
  it("チーの下端は1始まりに収める", () => {
    expect(meldTiles("chi", "1s")).toEqual(["1s", "2s", "3s"]);
  });
  it("チーの上端は7始まりに収める", () => {
    expect(meldTiles("chi", "9m")).toEqual(["7m", "8m", "9m"]);
  });
  it("赤5(0m)は5として扱う", () => {
    expect(meldTiles("chi", "0m")).toEqual(["4m", "5m", "6m"]);
  });
  it("字牌のチーは同種3枚にフォールバック", () => {
    expect(meldTiles("chi", "5z")).toEqual(["5z", "5z", "5z"]);
  });
});

describe("windOf", () => {
  it("親を東として各席の自風を返す", () => {
    expect(windOf("east", "east")).toBe("東");
    expect(windOf("south", "east")).toBe("南");
    expect(windOf("south", "south")).toBe("東");
    expect(windOf("north", "south")).toBe("西");
  });
});

describe("roundName", () => {
  it("局インデックスを表示名に", () => {
    expect(roundName(0)).toBe("東一局");
    expect(roundName(3)).toBe("東四局");
    expect(roundName(4)).toBe("南一局");
  });
});

describe("chunk", () => {
  it("n個ずつに分割", () => {
    expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
  });
});

describe("cameraSeatOf（絶対席 → カメラ相対）", () => {
  // 追加ピッカーの「鳴いた人」の既定値に使う。toAbsoluteSeat の逆写像。
  it.each([
    { bottom: "east" as Seat, seat: "east" as Seat, want: "bottom" },
    { bottom: "east" as Seat, seat: "south" as Seat, want: "right" },
    { bottom: "east" as Seat, seat: "west" as Seat, want: "top" },
    { bottom: "east" as Seat, seat: "north" as Seat, want: "left" },
    { bottom: "south" as Seat, seat: "south" as Seat, want: "bottom" },
    { bottom: "south" as Seat, seat: "east" as Seat, want: "left" },
  ])("手前=$bottom のとき $seat は $want", ({ bottom, seat, want }) => {
    expect(cameraSeatOf(seat, bottom)).toBe(want);
    // toAbsoluteSeat と往復で一致する（逆写像であることの担保）。
    expect(toAbsoluteSeat(cameraSeatOf(seat, bottom), bottom)).toBe(seat);
  });
});

describe("shimochaOf（下家＝次の打牌席）", () => {
  it.each([
    ["east", "south"],
    ["south", "west"],
    ["west", "north"],
    ["north", "east"],
  ] as const)("%s の下家は %s", (seat, want) => {
    expect(shimochaOf(seat)).toBe(want);
  });
});

describe("handIndexAfterEdit（理牌で動いた先の index）", () => {
  // 手牌を直すと理牌で並びが変わるので、フラッシュ位置は「動いた先」を指す必要がある。
  function kifuWithHand(tiles: Tile[]): Kifu {
    const k = KifuSchema.parse({
      schemaVersion: "1.0.0",
      capturedAt: "2026-07-26T00:00:00.000Z",
      seats: { east: { hand: tiles.map((tile) => ({ tile })) }, south: {}, west: {}, north: {} },
    });
    return k;
  }

  it("並びが変わらない修正では index が動かない", () => {
    const kifu = kifuWithHand(["1m", "5m", "9m"]);
    expect(handIndexAfterEdit(kifu, { seat: "east", area: "hand", index: 1 }, "4m")).toBe(1);
  });

  it("小さい牌へ直すと前へ動く", () => {
    const kifu = kifuWithHand(["1m", "5m", "9m"]);
    expect(handIndexAfterEdit(kifu, { seat: "east", area: "hand", index: 2 }, "2m")).toBe(1);
  });

  it("大きい牌へ直すと後ろへ動く（同じ牌が既にあれば安定ソートでその手前）", () => {
    const kifu = kifuWithHand(["1m", "5m", "9m"]);
    // [9m,5m,9m] を理牌 → [5m,9m,9m]。直した牌（元 index 0）は既存の 9m より前に来る。
    expect(handIndexAfterEdit(kifu, { seat: "east", area: "hand", index: 0 }, "9m")).toBe(1);
  });
});
