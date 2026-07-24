import { KifuSchema, type Kifu } from "@rigel/schema";
import { describe, expect, it } from "vitest";
import {
  analysisQuotaLabel,
  ANALYTICS_EVENTS,
  analyzeErrorMessage,
  applyTileEdit,
  filterPublicFeed,
  PUBLIC_FEED_FILTERS,
  isStoreManagedSubscription,
  planCardSubLabel,
  authorLabel,
  cameraLabel,
  checkoutErrorMessage,
  collectReviewItems,
  describeTile,
  meldTileViews,
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
  seatLabel,
  playersFromInput,
  playersToInput,
  signedPoints,
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
      hand: [{ tile: "9s" }, { tile: null }], // null = 必ず直す
      river: [{ order: 1, tile: null }], // null = 必ず直す
    },
    south: {},
    west: {},
    north: {},
  },
});

describe("needsReview（必ず直す牌の入口）", () => {
  it("読めなかった牌(null)は必ず修正対象", () => {
    expect(needsReview({ tile: null })).toBe(true);
  });

  it("読めた牌は対象外（AI ドラフト全体の目検は別途前提とする）", () => {
    expect(needsReview({ tile: "1m" })).toBe(false);
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

describe("playersFromInput（選手情報の入力文字列 → Players。web/mobile 編集で共用）", () => {
  const empty = { name: "", points: "" };
  it("全席が空（名前なし・0pt）なら null（記録しない対局）", () => {
    expect(
      playersFromInput({
        east: empty,
        south: { name: " ", points: "0" },
        west: empty,
        north: empty,
      }),
    ).toBeNull();
  });
  it("名前は trim・ポイントは数値化（不正値は 0）して組む", () => {
    const p = playersFromInput({
      east: { name: " 多井 ", points: "120.3" },
      south: { name: "園田", points: "abc" },
      west: empty,
      north: { name: "", points: "-45.7" },
    });
    expect(p?.east).toEqual({ name: "多井", points: 120.3 });
    expect(p?.south).toEqual({ name: "園田", points: 0 });
    expect(p?.west).toEqual({ name: "", points: 0 });
    expect(p?.north.points).toBe(-45.7);
  });

  it("ポイントは小数1桁へ丸め、Infinity などの異常値は 0 に倒す（schema の finite と整合）", () => {
    const p = playersFromInput({
      east: { name: "多井", points: "120.34" },
      south: { name: "", points: "1e999" }, // parseFloat で Infinity になる入力
      west: empty,
      north: empty,
    });
    expect(p?.east.points).toBe(120.3);
    expect(p?.south.points).toBe(0);
  });
});

describe("playersToInput（Players → 入力文字列。playersFromInput の逆変換）", () => {
  it("保存値から入力初期値を組む（null は全席空）", () => {
    const players = {
      east: { name: "多井", points: 120.3 },
      south: { name: "", points: -45.7 },
      west: { name: "", points: 0 },
      north: { name: "", points: 0 },
    };
    const input = playersToInput(players);
    expect(input.east).toEqual({ name: "多井", points: "120.3" });
    expect(input.south).toEqual({ name: "", points: "-45.7" });

    const blank = playersToInput(null);
    expect(blank.east).toEqual({ name: "", points: "0" });
  });
});

describe("signedPoints（リーグ戦ポイントの符号つき表示）", () => {
  it("符号つき小数1桁で整形する（正は + を付ける）", () => {
    expect(signedPoints(120.3)).toBe("+120.3");
    expect(signedPoints(-45.7)).toBe("-45.7");
    expect(signedPoints(0)).toBe("+0.0");
  });
  it("不正値は 0.0", () => {
    expect(signedPoints(NaN)).toBe("0.0");
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
  it("429（レート制限）は混雑として案内する（連打・乱用の抑制はサーバ側で行う）", () => {
    expect(analyzeErrorMessage(429)).toMatch(/混み合/);
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
  it("planMonthlyPriceAppStore はストア掲載価格（App Store Connect の設定値と一致）", () => {
    expect(planMonthlyPriceAppStore("free")).toBe(0);
    expect(planMonthlyPriceAppStore("next")).toBe(700);
    expect(planMonthlyPriceAppStore("pro")).toBe(1800);
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
  it("analysisQuotaLabel: 当月の残枠/枠を表示し、未取得（auth 直後）や free（枠0）は null", () => {
    expect(analysisQuotaLabel(92, 100)).toBe("解析枠 残り 92 / 100（今月）");
    expect(analysisQuotaLabel(0, 320)).toBe("解析枠 残り 0 / 320（今月）");
    expect(analysisQuotaLabel(undefined, 100)).toBeNull();
    expect(analysisQuotaLabel(92, undefined)).toBeNull();
    expect(analysisQuotaLabel(0, 0)).toBeNull();
  });
  it("planCardSubLabel: free は「無料」、有料は解析枠、枠未取得は null（web/mobile 共通の出し分け）", () => {
    expect(planCardSubLabel("free")).toBe("無料");
    expect(planCardSubLabel("next", 92, 100)).toBe("解析枠 残り 92 / 100（今月）");
    expect(planCardSubLabel("pro")).toBeNull();
  });
  it("isStoreManagedSubscription: IAP はストア管理、STRIPE/経路不明はポータル。未知 store は安全側（ストア）", () => {
    expect(isStoreManagedSubscription("APP_STORE")).toBe(true);
    expect(isStoreManagedSubscription("PLAY_STORE")).toBe(true);
    expect(isStoreManagedSubscription("AMAZON")).toBe(true); // 将来値はポータル 404 を避ける側へ
    expect(isStoreManagedSubscription("STRIPE")).toBe(false);
    expect(isStoreManagedSubscription(null)).toBe(false);
    expect(isStoreManagedSubscription(undefined)).toBe(false);
  });
  it("filterPublicFeed: 新着=全件を新しい順 / 今週=直近7日（ちょうど7日前を含む）/ お気に入り=favs のみ", () => {
    const now = Date.parse("2026-07-11T12:00:00.000Z");
    const day = 24 * 3600 * 1000;
    const cards = [
      { id: "a", createdAt: new Date(now - 10 * day).toISOString() },
      { id: "b", createdAt: new Date(now - 7 * day).toISOString() }, // ちょうど7日前=今週に含む
      { id: "c", createdAt: new Date(now).toISOString() },
    ];
    const favs = new Set(["a"]);

    expect(filterPublicFeed(cards, "new", favs, now).map((c) => c.id)).toEqual(["c", "b", "a"]);
    expect(filterPublicFeed(cards, "week", favs, now).map((c) => c.id)).toEqual(["c", "b"]);
    expect(filterPublicFeed(cards, "fav", favs, now).map((c) => c.id)).toEqual(["a"]);
  });
  it("PUBLIC_FEED_FILTERS は web/mobile 共通の選択肢（キー＋ラベル）を1箇所で定義する", () => {
    expect(PUBLIC_FEED_FILTERS.map((f) => f.key)).toEqual(["new", "week", "fav"]);
    expect(PUBLIC_FEED_FILTERS.map((f) => f.label)).toEqual(["新着", "今週", "お気に入り"]);
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
  it("読めなかった牌(null)だけを席順に集める", () => {
    const items = collectReviewItems(kifuWithReviews);
    expect(items).toHaveLength(2);
    expect(items[0]?.location).toMatchObject({ seat: "east", area: "hand", index: 1 });
    expect(items[1]?.location).toMatchObject({ seat: "east", area: "river", index: 0 });
  });
});

describe("applyTileEdit", () => {
  it("対象牌を修正する（元は不変）", () => {
    const items = collectReviewItems(kifuWithReviews);
    const loc = items[1]!.location; // east river[0] = null
    const next = applyTileEdit(kifuWithReviews, loc, "5p");

    expect(next.seats.east.river[0]).toMatchObject({ tile: "5p" });
    // 元の牌譜は変わらない
    expect(kifuWithReviews.seats.east.river[0]?.tile).toBeNull();
  });

  it("修正後は要確認が1件減る", () => {
    const loc = collectReviewItems(kifuWithReviews)[0]!.location;
    const next = applyTileEdit(kifuWithReviews, loc, "2m");
    expect(collectReviewItems(next)).toHaveLength(1);
  });

  it("手牌の修正後は理牌される（河はそのまま）", () => {
    // east.hand = [9s, null] の null(index 1) を 1m に → 理牌で先頭へ動く。
    const next = applyTileEdit(kifuWithReviews, { seat: "east", area: "hand", index: 1 }, "1m");
    expect(next.seats.east.hand.map((t) => t.tile)).toEqual(["1m", "9s"]);
    expect(next.seats.east.river.map((d) => d.tile)).toEqual([null]); // 河は不変
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

describe("meldTileViews（鳴きの表示: 横向き位置・暗槓の背面）", () => {
  const meld = (type: string, tiles: string[], from: string | null) =>
    ({
      type,
      tiles: tiles.map((t) => ({ tile: t })),
      from,
    }) as never;

  it("暗槓は両端2枚が背面・横向きなし", () => {
    const v = meldTileViews(meld("kan_closed", ["8s", "8s", "8s", "8s"], null), "east");
    expect(v.map((x) => x.back)).toEqual([true, false, false, true]);
    expect(v.every((x) => !x.lay)).toBe(true);
    expect(v.map((x) => x.tile)).toEqual(["8s", "8s", "8s", "8s"]);
  });

  it("ポン: 上家から=左端・対面から=左から2枚目・下家から=右端が横向き", () => {
    // 南家がポン。上家=東・対面=北・下家=西。
    const lay = (from: string) =>
      meldTileViews(meld("pon", ["5z", "5z", "5z"], from), "south").map((x) => x.lay);
    expect(lay("east")).toEqual([true, false, false]);
    expect(lay("north")).toEqual([false, true, false]);
    expect(lay("west")).toEqual([false, false, true]);
  });

  it("大明槓も同じ規則（4枚。対面からは左から2枚目が横向き）", () => {
    const v = meldTileViews(meld("kan_open", ["5p", "5p", "5p", "5p"], "north"), "south");
    expect(v.map((x) => x.lay)).toEqual([false, true, false, false]);
    expect(v.every((x) => !x.back)).toBe(true);
  });

  it("from 不明（AI 取り込み等）は左端を横向きにする（従来表示の互換）", () => {
    const v = meldTileViews(meld("pon", ["5z", "5z", "5z"], null), "south");
    expect(v.map((x) => x.lay)).toEqual([true, false, false]);
  });
});

describe("ANALYTICS_EVENTS（計測イベントの共有体系。web=GA4 / mobile=Firebase で同一）", () => {
  it("GA4 標準の login/sign_up を含み、独自イベントは snake_case", () => {
    expect(ANALYTICS_EVENTS.login).toBe("login");
    expect(ANALYTICS_EVENTS.signUp).toBe("sign_up");
    for (const name of Object.values(ANALYTICS_EVENTS)) {
      // GA4 のイベント名規約（英小文字とアンダースコアのみ・40文字以内）。
      expect(name).toMatch(/^[a-z][a-z0-9_]{0,39}$/);
    }
  });

  it("解析・保存・回答のコアファネルを持つ", () => {
    expect(ANALYTICS_EVENTS.analyzeKifu).toBe("analyze_kifu");
    expect(ANALYTICS_EVENTS.analyzeProblem).toBe("analyze_problem");
    expect(ANALYTICS_EVENTS.saveKifu).toBe("save_kifu");
    expect(ANALYTICS_EVENTS.answerProblem).toBe("answer_problem");
  });
});
