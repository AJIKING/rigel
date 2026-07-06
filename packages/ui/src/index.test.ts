import { KifuSchema, type Kifu } from "@rigel/schema";
import { describe, expect, it } from "vitest";
import {
  analyzeErrorMessage,
  applyTileEdit,
  authorLabel,
  cameraLabel,
  checkoutErrorMessage,
  collectReviewItems,
  describeTile,
  needsReview,
  planCanAnalyze,
  planKifuLimits,
  planLabel,
  planMonthlyAiQuota,
  LIMIT_MESSAGES,
  PLAN_FEATURES,
  planMonthlyPrice,
  planMonthlyPriceAppStore,
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
    expect(analyzeErrorMessage(402)).toMatch(/上限/);
    expect(analyzeErrorMessage(502)).toMatch(/解析に失敗/);
  });
  it("既定は人向けの reason（日本語・記号入り）はそのまま出す", () => {
    expect(analyzeErrorMessage(400, "河の写真が必要です")).toBe("河の写真が必要です");
    expect(analyzeErrorMessage(400)).toBe("解析に失敗しました。");
  });
  it("機械コードの reason はユーザーに見せず一般文言にする", () => {
    expect(analyzeErrorMessage(400, "user_not_found")).toBe("解析に失敗しました。");
    expect(analyzeErrorMessage(400, "game_not_found")).toBe("解析に失敗しました。");
  });
});

describe("checkoutErrorMessage", () => {
  it("501 は準備中、その他は汎用メッセージ", () => {
    expect(checkoutErrorMessage(501)).toMatch(/準備中/);
    expect(checkoutErrorMessage(500)).toBe("開始できませんでした。");
  });
  it("409（加入中）は決済ポータルへ案内する", () => {
    expect(checkoutErrorMessage(409)).toMatch(/ポータル/);
  });
});

describe("プラン表示", () => {
  it("planLabel / planMonthlyPrice", () => {
    expect(planLabel("free")).toBe("Free");
    expect(planLabel("next")).toBe("Next");
    expect(planLabel("pro")).toBe("Pro");
    expect(planMonthlyPrice("next")).toBe(480);
  });
  it("planMonthlyPriceAppStore は App Store 手数料ぶん 30% 割増", () => {
    expect(planMonthlyPriceAppStore("free")).toBe(0);
    expect(planMonthlyPriceAppStore("next")).toBe(624); // 480 × 1.3
    expect(planMonthlyPriceAppStore("pro")).toBe(1924); // 1480 × 1.3
  });
  it("upgradeTargets は上位プランだけ返す", () => {
    expect(upgradeTargets("free")).toEqual(["next", "pro"]);
    expect(upgradeTargets("next")).toEqual(["pro"]);
    expect(upgradeTargets("pro")).toEqual([]);
  });
  it("planCanAnalyze: free は解析不可（枠0）、有料は可", () => {
    expect(planCanAnalyze("free")).toBe(false);
    expect(planCanAnalyze("next")).toBe(true);
    expect(planCanAnalyze("pro")).toBe(true);
    expect(planMonthlyAiQuota("next")).toBe(100);
    expect(planMonthlyAiQuota("pro")).toBe(320);
  });
  it("PLAN_FEATURES は全プランに説明があり、上限は半荘単位の文言", () => {
    expect(PLAN_FEATURES.free.some((f) => f.includes("半荘"))).toBe(true);
    expect(PLAN_FEATURES.next.length).toBeGreaterThan(0);
    expect(PLAN_FEATURES.pro.length).toBeGreaterThan(0);
  });
  it("planKifuLimits は free=各5・有料=無制限(null)", () => {
    expect(planKifuLimits("free")).toEqual({ private: 5, draft: 5 });
    expect(planKifuLimits("next")).toEqual({ private: null, draft: null });
    expect(planKifuLimits("pro")).toEqual({ private: null, draft: null });
  });
  it("LIMIT_MESSAGES は上限値（半荘5・30局）を含む共通文言", () => {
    expect(LIMIT_MESSAGES.privateGames).toContain("半荘は5つまで");
    expect(LIMIT_MESSAGES.draftGames).toContain("下書き半荘は5つまで");
    expect(LIMIT_MESSAGES.gameFull).toBe("1半荘は30局までです。");
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

describe("authorLabel", () => {
  it("handle があれば @handle", () => {
    expect(authorLabel({ handle: "kuro", name: "くろ" })).toBe("@kuro");
  });
  it("handle が無ければ表示名", () => {
    expect(authorLabel({ handle: null, name: "くろ" })).toBe("くろ");
  });
  it("どちらも無ければ既定の名無し（fallback 指定可）", () => {
    expect(authorLabel({ handle: null, name: null })).toBe("名無し");
    expect(authorLabel({}, "匿名")).toBe("匿名");
  });
});
