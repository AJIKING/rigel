import { KifuSchema, type Kifu } from "@rigel/schema";
import { describe, expect, it } from "vitest";
import {
  analyzeErrorMessage,
  applyTileEdit,
  cameraLabel,
  checkoutErrorMessage,
  collectReviewItems,
  describeTile,
  needsReview,
  planLabel,
  planMonthlyPrice,
  RED_TILE_COLOR,
  REVIEW_CONFIDENCE_THRESHOLD,
  seatLabel,
  tileAssetName,
  tileFace,
  tileLabel,
  upgradeTargets,
  visibilityLabel,
} from "./index";

const kifuWithReviews: Kifu = KifuSchema.parse({
  schemaVersion: "1.0.0",
  capturedAt: "2026-06-28T00:00:00.000Z",
  seats: {
    east: {
      hand: [
        { tile: "1m", confidence: 0.99 },
        { tile: "2m", confidence: 0.3 }, // 要確認
      ],
      river: [{ order: 1, tile: null, confidence: 0 }], // 要確認
    },
    south: {},
    west: {},
    north: {},
  },
});

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

describe("cameraLabel", () => {
  it("カメラ相対位置を日本語にする", () => {
    expect(cameraLabel("bottom")).toBe("手前");
    expect(cameraLabel("top")).toBe("向かい");
  });
});

describe("analyzeErrorMessage", () => {
  it("ステータスごとにメッセージを返す", () => {
    expect(analyzeErrorMessage(402)).toMatch(/無料枠/);
    expect(analyzeErrorMessage(502)).toMatch(/解析に失敗/);
  });
  it("既定は reason かフォールバック", () => {
    expect(analyzeErrorMessage(400, "bad")).toBe("bad");
    expect(analyzeErrorMessage(400)).toBe("保存に失敗しました。");
  });
});

describe("checkoutErrorMessage", () => {
  it("501 は準備中、その他は汎用メッセージ", () => {
    expect(checkoutErrorMessage(501)).toMatch(/準備中/);
    expect(checkoutErrorMessage(500)).toBe("開始できませんでした。");
  });
});

describe("プラン表示", () => {
  it("planLabel / planMonthlyPrice", () => {
    expect(planLabel("free")).toBe("無料");
    expect(planLabel("pro")).toBe("RIGEL Pro");
    expect(planMonthlyPrice("next")).toBe(480);
  });
  it("upgradeTargets は上位プランだけ返す", () => {
    expect(upgradeTargets("free")).toEqual(["next", "pro"]);
    expect(upgradeTargets("next")).toEqual(["pro"]);
    expect(upgradeTargets("pro")).toEqual([]);
  });
  it("visibilityLabel", () => {
    expect(visibilityLabel("public")).toBe("公開");
    expect(visibilityLabel("private")).toBe("非公開");
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

describe("tileAssetName（OSS牌画像のファイル名）", () => {
  it("数牌は Man/Pin/Sou + 数字", () => {
    expect(tileAssetName("1m")).toBe("Man1");
    expect(tileAssetName("9s")).toBe("Sou9");
    expect(tileAssetName("5p")).toBe("Pin5");
  });
  it("赤ドラは *5-Dora", () => {
    expect(tileAssetName("0m")).toBe("Man5-Dora");
    expect(tileAssetName("0p")).toBe("Pin5-Dora");
    expect(tileAssetName("0s")).toBe("Sou5-Dora");
  });
  it("字牌は固有名", () => {
    expect(tileAssetName("1z")).toBe("Ton");
    expect(tileAssetName("4z")).toBe("Pei");
    expect(tileAssetName("5z")).toBe("Haku");
    expect(tileAssetName("7z")).toBe("Chun");
  });
});

describe("collectReviewItems", () => {
  it("確信度の低い牌と読めない牌だけを席順に集める", () => {
    const items = collectReviewItems(kifuWithReviews);
    expect(items).toHaveLength(2);
    expect(items[0]?.location).toMatchObject({ seat: "east", area: "hand", index: 1 });
    expect(items[1]?.location).toMatchObject({ seat: "east", area: "river", index: 0 });
  });
});

describe("applyTileEdit", () => {
  it("対象牌を修正し confidence を 1 にする（元は不変）", () => {
    const items = collectReviewItems(kifuWithReviews);
    const loc = items[1]!.location; // east river[0] = null
    const next = applyTileEdit(kifuWithReviews, loc, "5p");

    expect(next.seats.east.river[0]).toMatchObject({ tile: "5p", confidence: 1 });
    // 元の牌譜は変わらない
    expect(kifuWithReviews.seats.east.river[0]?.tile).toBeNull();
  });

  it("修正後は要確認が1件減る", () => {
    const loc = collectReviewItems(kifuWithReviews)[0]!.location;
    const next = applyTileEdit(kifuWithReviews, loc, "2m");
    expect(collectReviewItems(next)).toHaveLength(1);
  });
});
