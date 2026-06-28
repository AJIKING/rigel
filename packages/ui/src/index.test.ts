import { describe, expect, it } from "vitest";
import {
  describeTile,
  needsReview,
  RED_TILE_COLOR,
  REVIEW_CONFIDENCE_THRESHOLD,
  seatLabel,
  tileFace,
  tileLabel,
} from "./index";

describe("needsReview（confidence → 人手確認の入口）", () => {
  it("読めなかった牌(null)は必ず要確認", () => {
    expect(needsReview({ tile: null, confidence: 0 })).toBe(true);
  });

  it("確信度が閾値未満なら要確認", () => {
    expect(needsReview({ tile: "1m", confidence: REVIEW_CONFIDENCE_THRESHOLD - 0.01 })).toBe(true);
  });

  it("確信度が十分高ければ確認不要", () => {
    expect(needsReview({ tile: "1m", confidence: 0.99 })).toBe(false);
  });
});

describe("describeTile", () => {
  it("数牌を suit/rank に分解する", () => {
    expect(describeTile("3p")).toEqual({ suit: "p", rank: 3, red: false });
  });

  it("赤ドラ(0m)は rank=5・red=true", () => {
    expect(describeTile("0m")).toEqual({ suit: "m", rank: 5, red: true });
  });

  it("null は null", () => {
    expect(describeTile(null)).toBeNull();
  });
});

describe("tileLabel", () => {
  it("数牌は数字+スート", () => {
    expect(tileLabel("1m")).toBe("1萬");
  });
  it("赤ドラは赤付き", () => {
    expect(tileLabel("0s")).toBe("赤5索");
  });
  it("字牌は名前", () => {
    expect(tileLabel("1z")).toBe("東");
    expect(tileLabel("7z")).toBe("中");
  });
  it("null は ?", () => {
    expect(tileLabel(null)).toBe("?");
  });
});

describe("seatLabel", () => {
  it("席を日本語にする", () => {
    expect(seatLabel("east")).toBe("東");
    expect(seatLabel("north")).toBe("北");
  });
});

describe("tileFace（描画用の面仕様）", () => {
  it("数牌は kind=number でスート記号と色を持つ", () => {
    expect(tileFace("3p")).toMatchObject({
      kind: "number",
      rank: 3,
      suit: "p",
      red: false,
      glyph: "筒",
    });
  });

  it("赤ドラは red=true で赤色", () => {
    const f = tileFace("0s");
    expect(f.kind).toBe("number");
    expect(f.rank).toBe(5);
    expect(f.red).toBe(true);
    expect(f.color).toBe(RED_TILE_COLOR);
  });

  it("字牌は kind=honor で名前を glyph に持つ", () => {
    expect(tileFace("1z")).toMatchObject({ kind: "honor", glyph: "東" });
    expect(tileFace("7z")).toMatchObject({ kind: "honor", glyph: "中" });
  });

  it("読めない牌(null)は kind=unknown で ?", () => {
    expect(tileFace(null)).toMatchObject({ kind: "unknown", glyph: "?" });
  });
});
