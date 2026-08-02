import { FREE_QUIZ_PER_DAY, KifuSchema, type Kifu } from "@rigel/schema";
import { describe, expect, it } from "vitest";
import {
  analysisJobFailureMessage,
  analysisPollDelayMs,
  analysisTimeoutMessage,
  pollAnalysisOutcome,
  pollProblemAnalysisOutcome,
  problemAnalysisTimeoutMessage,
  analysisQuotaLabel,
  ANALYTICS_EVENTS,
  analyzeErrorMessage,
  applyTileEdit,
  filterPublicFeed,
  MY_LIST_SORTS,
  PUBLIC_FEED_FILTERS,
  sortMyList,
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
  it("analysisPollDelayMs: 段階バックオフ 2s→5s→10s、10分でハードストップ（docs/plans/async-analysis.md 3-2）", () => {
    expect(analysisPollDelayMs(0)).toBe(2000);
    expect(analysisPollDelayMs(29_000)).toBe(2000);
    expect(analysisPollDelayMs(30_000)).toBe(5000);
    expect(analysisPollDelayMs(119_000)).toBe(5000);
    expect(analysisPollDelayMs(120_000)).toBe(10_000);
    expect(analysisPollDelayMs(9 * 60_000)).toBe(10_000);
    expect(analysisPollDelayMs(10 * 60_000)).toBeNull(); // 打ち切り（タイマー消し忘れ事故の構造的防止）
  });

  it("pollAnalysisOutcome: done/failed/404/打ち切りを結果に写す（web/mobile 共通ループ）", async () => {
    const clock = (start = 0) => {
      let t = start;
      return { now: () => t, sleep: (ms: number) => ((t += ms), Promise.resolve()) };
    };

    // done（途中の processing と一時例外を挟んでも完走する）
    const seq: (unknown | Error)[] = [
      new Error("network"),
      { status: "processing", gameId: null, logId: null, reason: null },
      { status: "done", gameId: "g1", logId: "l1", reason: null },
    ];
    const fetchJob = () => {
      const next = seq.shift();
      return next instanceof Error ? Promise.reject(next) : Promise.resolve(next as never);
    };
    expect(await pollAnalysisOutcome(fetchJob, 0, clock())).toEqual({
      kind: "done",
      gameId: "g1",
      logId: "l1",
    });

    // failed は理由の文言
    const failed = await pollAnalysisOutcome(
      () => Promise.resolve({ status: "failed", gameId: null, logId: null, reason: "game_full" }),
      0,
      clock(),
    );
    expect(failed).toEqual({ kind: "failed", message: analysisJobFailureMessage("game_full") });

    // 404（null）は失敗扱い
    const gone = await pollAnalysisOutcome(() => Promise.resolve(null), 0, clock());
    expect(gone.kind).toBe("failed");

    // 予算超過は timeout
    const timeout = await pollAnalysisOutcome(
      () => Promise.resolve({ status: "processing", gameId: null, logId: null, reason: null }),
      0,
      clock(),
    );
    expect(timeout).toEqual({ kind: "timeout" });

    // shouldStop（サインアウト・画面破棄）で cancelled を返し、それ以上リクエストしない
    let calls = 0;
    const cancelled = await pollAnalysisOutcome(
      () => {
        calls += 1;
        return Promise.resolve({ status: "processing", gameId: null, logId: null, reason: null });
      },
      0,
      clock(),
      () => calls >= 1,
    );
    expect(cancelled).toEqual({ kind: "cancelled" });
    expect(calls).toBe(1);
  });

  it("pollProblemAnalysisOutcome: done は結果ドラフトを返し、done なのに draft 無し（期限切れ）は失敗", async () => {
    const clock = (start = 0) => {
      let t = start;
      return { now: () => t, sleep: (ms: number) => ((t += ms), Promise.resolve()) };
    };
    const doneJob = (draft: Kifu | null) => ({ status: "done" as const, reason: null, draft });

    const done = await pollProblemAnalysisOutcome(
      () => Promise.resolve(doneJob(kifuWithReviews)),
      0,
      clock(),
    );
    expect(done).toEqual({ kind: "done", kifu: kifuWithReviews });

    // done でも結果が消えていたら（R2 TTL 1日）失敗として案内する
    const expired = await pollProblemAnalysisOutcome(
      () => Promise.resolve(doneJob(null)),
      0,
      clock(),
    );
    expect(expired).toEqual({
      kind: "failed",
      message: analysisJobFailureMessage("result_expired"),
    });

    // failed / timeout / cancelled は牌譜ジョブと同じ扱い
    const failed = await pollProblemAnalysisOutcome(
      () => Promise.resolve({ status: "failed" as const, reason: "quota_exceeded", draft: null }),
      0,
      clock(),
    );
    expect(failed).toEqual({
      kind: "failed",
      message: analysisJobFailureMessage("quota_exceeded"),
    });

    const timeout = await pollProblemAnalysisOutcome(
      () => Promise.resolve({ status: "processing" as const, reason: null, draft: null }),
      0,
      clock(),
    );
    expect(timeout).toEqual({ kind: "timeout" });
  });

  it("problemAnalysisTimeoutMessage: 何切るは一覧に現れないので再試行を促す文言", () => {
    expect(problemAnalysisTimeoutMessage()).toMatch(/もう一度/);
  });

  it("analysisTimeoutMessage: 打ち切り案内は web/mobile 共通の一文（一覧に載る旨）", () => {
    expect(analysisTimeoutMessage()).toMatch(/牌譜一覧/);
  });

  it("analysisJobFailureMessage: ジョブの失敗理由を日本語にする（未知理由・null は汎用文言）", () => {
    expect(analysisJobFailureMessage("quota_exceeded")).toMatch(/上限/);
    expect(analysisJobFailureMessage("game_full")).toMatch(/局/);
    expect(analysisJobFailureMessage("game_not_found")).toMatch(/半荘/);
    expect(analysisJobFailureMessage("images_missing")).toMatch(/解析に失敗/);
    expect(analysisJobFailureMessage("analysis_failed")).toMatch(/解析に失敗/);
    expect(analysisJobFailureMessage(null)).toMatch(/解析に失敗/);
  });

  it("isStoreManagedSubscription: IAP はストア管理、STRIPE/経路不明はポータル。未知 store は安全側（ストア）", () => {
    expect(isStoreManagedSubscription("APP_STORE")).toBe(true);
    expect(isStoreManagedSubscription("PLAY_STORE")).toBe(true);
    expect(isStoreManagedSubscription("AMAZON")).toBe(true); // 将来値はポータル 404 を避ける側へ
    expect(isStoreManagedSubscription("STRIPE")).toBe(false);
    expect(isStoreManagedSubscription(null)).toBe(false);
    expect(isStoreManagedSubscription(undefined)).toBe(false);
  });
  it("filterPublicFeed: 新着=全件を新しい順 / 今週=直近7日（ちょうど7日前を含む）/ お気に入り=viewerFaved のみ", () => {
    const now = Date.parse("2026-07-11T12:00:00.000Z");
    const day = 24 * 3600 * 1000;
    const card = (id: string, daysAgo: number, favoriteCount = 0, viewerFaved = false) => ({
      id,
      createdAt: new Date(now - daysAgo * day).toISOString(),
      favoriteCount,
      viewerFaved,
    });
    const cards = [
      card("a", 10, 0, true),
      card("b", 7), // ちょうど7日前=今週に含む
      card("c", 0),
    ];

    expect(filterPublicFeed(cards, "new", now).map((c) => c.id)).toEqual(["c", "b", "a"]);
    expect(filterPublicFeed(cards, "week", now).map((c) => c.id)).toEqual(["c", "b"]);
    expect(filterPublicFeed(cards, "fav", now).map((c) => c.id)).toEqual(["a"]);
  });
  it("filterPublicFeed: 人気=お気に入りが多い順（全件対象。同数は新しい順で決着）", () => {
    const now = Date.parse("2026-07-11T12:00:00.000Z");
    const day = 24 * 3600 * 1000;
    const card = (id: string, daysAgo: number, favoriteCount: number) => ({
      id,
      createdAt: new Date(now - daysAgo * day).toISOString(),
      favoriteCount,
      viewerFaved: false,
    });
    // old/new は同数（3）。新しい new が先に来る。
    const cards = [card("old", 30, 3), card("top", 20, 9), card("new", 0, 3), card("none", 1, 0)];

    expect(filterPublicFeed(cards, "popular", now).map((c) => c.id)).toEqual([
      "top",
      "new",
      "old",
      "none",
    ]);
  });
  it("PUBLIC_FEED_FILTERS は web/mobile 共通の選択肢（キー＋ラベル）を1箇所で定義する", () => {
    expect(PUBLIC_FEED_FILTERS.map((f) => f.key)).toEqual(["new", "popular", "week", "fav"]);
    expect(PUBLIC_FEED_FILTERS.map((f) => f.label)).toEqual(["新着", "人気", "今週", "お気に入り"]);
  });
  it("MY_LIST_SORTS は 新しい順/古い順/お気に入りが多い順（『局数が多い順』は廃止）", () => {
    expect(MY_LIST_SORTS.map((s) => s.key)).toEqual(["new", "old", "fav"]);
    expect(MY_LIST_SORTS.map((s) => s.label)).toEqual(["新しい順", "古い順", "お気に入りが多い順"]);
  });
  it("sortMyList: new=新しい順 / old=古い順 / fav=お気に入りが多い順（同数は新しい順）", () => {
    const card = (id: string, createdAt: string, favoriteCount: number) => ({
      id,
      createdAt,
      favoriteCount,
      viewerFaved: false,
    });
    const cards = [
      card("a", "2026-07-01T00:00:00.000Z", 2),
      card("b", "2026-07-03T00:00:00.000Z", 5),
      card("c", "2026-07-02T00:00:00.000Z", 2),
    ];

    expect(sortMyList(cards, "new").map((c) => c.id)).toEqual(["b", "c", "a"]);
    expect(sortMyList(cards, "old").map((c) => c.id)).toEqual(["a", "c", "b"]);
    expect(sortMyList(cards, "fav").map((c) => c.id)).toEqual(["b", "c", "a"]);
  });
  it("PLAN_FEATURES は全プランに説明があり、上限は半荘単位の文言", () => {
    expect(PLAN_FEATURES.free.some((f) => f.includes("半荘"))).toBe(true);
    expect(PLAN_FEATURES.next.length).toBeGreaterThan(0);
    expect(PLAN_FEATURES.pro.length).toBeGreaterThan(0);
  });
  it("PLAN_FEATURES: 特訓は free=1日3回（FREE_QUIZ_PER_DAY 連動）・有料（next/pro）=無制限（機能名は「特訓」で統一）", () => {
    expect(PLAN_FEATURES.free).toContain(`特訓 1日${FREE_QUIZ_PER_DAY}回`);
    expect(PLAN_FEATURES.next).toContain("特訓 無制限");
    expect(PLAN_FEATURES.pro).toContain("特訓 無制限");
  });
  it("FREE_QUIZ_PER_DAY は無料プランの特訓1日3回（api のサーバ強制と web/mobile 文言の共有値）", () => {
    expect(FREE_QUIZ_PER_DAY).toBe(3);
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

  it("特訓クイズの開始・完了イベントを持つ（params は kind のみ＝成績・PII は載らない）", () => {
    expect(ANALYTICS_EVENTS.quizStart).toBe("quiz_start");
    expect(ANALYTICS_EVENTS.quizComplete).toBe("quiz_complete");
  });
});
