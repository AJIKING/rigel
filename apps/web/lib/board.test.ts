import { describe, expect, it } from "vitest";
import { chunk, meldTiles, roundName, windOf } from "./board";

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
