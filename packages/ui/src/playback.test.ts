import { KifuSchema, type Kifu, type TimelineEvent } from "@rigel/schema";
import { describe, expect, it } from "vitest";
import {
  activeDrawnTile,
  buildPlaybackFrame,
  buildPlaybackState,
  playbackKifu,
  splitDrawnTile,
  stepDisplay,
  stepHasDraw,
  tsumoWinDisplay,
} from "./playback";

const kifu = (over: Record<string, unknown> = {}): Kifu =>
  KifuSchema.parse({
    schemaVersion: "1.0.0",
    capturedAt: "2026-06-28T00:00:00.000Z",
    meta: { dealer: "east", kyotaku: 0 },
    seats: { east: {}, south: {}, west: {}, north: {} },
    ...over,
  });

const discard = (over: Partial<Extract<TimelineEvent, { kind: "discard" }>>): TimelineEvent => ({
  kind: "discard",
  seat: "east",
  draw: null,
  tile: "1m",
  tsumogiri: false,
  riichi: false,
  confidence: 1,
  ...over,
});

const hand = (tiles: string[]) => tiles.map((tile) => ({ tile, confidence: 1 }));

describe("buildPlaybackState（再生ステップの局面導出）", () => {
  it("0手目は配牌を保持し、河はまだ空にする", () => {
    const k = kifu({
      seats: { east: { hand: hand(["1m", "2m"]) }, south: {}, west: {}, north: {} },
      timeline: [discard({ draw: "3m", tile: "1m" })],
    });

    const state = buildPlaybackState(k, 0);

    expect(state.seats.east.hand.map((t) => t.tile)).toEqual(["1m", "2m"]);
    expect(state.seats.east.river).toEqual([]);
    expect(state.kyotaku).toBe(0);
  });

  it("手出しはツモ牌を手牌に加え、捨て牌を手牌から1枚除いて河へ置く", () => {
    const k = kifu({
      seats: { east: { hand: hand(["1m", "2m"]) }, south: {}, west: {}, north: {} },
      timeline: [discard({ draw: "3m", tile: "1m", tsumogiri: false })],
    });

    const state = buildPlaybackState(k, 1);

    expect(state.seats.east.hand.map((t) => t.tile)).toEqual(["2m", "3m"]);
    expect(state.seats.east.river.map((d) => d.tile)).toEqual(["1m"]);
    expect(state.activeDraw).toEqual({ seat: "east", tile: "3m" });
  });

  it("ツモ切りはツモ牌を手牌に残さず、そのまま河へ置く", () => {
    const k = kifu({
      seats: { east: { hand: hand(["1m", "2m"]) }, south: {}, west: {}, north: {} },
      timeline: [discard({ draw: "3m", tile: "3m", tsumogiri: true })],
    });

    const state = buildPlaybackState(k, 1);

    expect(state.seats.east.hand.map((t) => t.tile)).toEqual(["1m", "2m"]);
    expect(state.seats.east.river[0]).toMatchObject({ order: 1, tile: "3m", tsumogiri: true });
  });

  it("リーチ宣言牌を再生した時点で供託(リーチ棒)を増やす", () => {
    const k = kifu({
      meta: { dealer: "east", kyotaku: 1 },
      seats: { east: { hand: hand(["1m", "2m"]) }, south: {}, west: {}, north: {} },
      timeline: [discard({ tile: "1m", riichi: true })],
    });

    const state = buildPlaybackState(k, 1);

    expect(state.kyotaku).toBe(2);
    expect(state.seats.east.river[0]).toMatchObject({ tile: "1m", riichi: true });
  });

  it("歩幅は打牌単位。鳴きは間に挟まっても打牌数でズレない（次の打牌が出るまで鳴きも出さない）", () => {
    const k = kifu({
      seats: {
        east: { hand: hand(["1m", "2m", "9s"]) },
        south: { hand: hand(["5z", "5z", "5z", "6z"]) },
        west: {},
        north: {},
      },
      timeline: [
        discard({ seat: "east", tile: "1m", draw: "9s" }),
        {
          kind: "meld",
          seat: "south",
          meld: { type: "pon", tiles: hand(["5z", "5z", "5z"]), from: "east" },
        },
        discard({ seat: "east", tile: "2m", draw: "3m" }),
      ],
    });

    // 打牌1つぶん → 鳴きはまだ出さない（2手目の打牌の直前にある鳴きは伏せる）。
    const one = buildPlaybackState(k, 1);
    expect(one.seats.east.river.map((d) => d.tile)).toEqual(["1m"]);
    expect(one.seats.south.melds).toHaveLength(0);
    // 打牌2つぶん → 間の鳴きも出る。
    const two = buildPlaybackState(k, 2);
    expect(two.seats.east.river.map((d) => d.tile)).toEqual(["1m", "2m"]);
    expect(two.seats.south.melds).toHaveLength(1);
  });

  it("timeline が空（AI/未編集）の牌譜は手牌を再構成せず静的に見せ、河だけ進める", () => {
    const k = kifu({
      seats: {
        east: {
          hand: hand(["1m", "2m", "3m"]),
          river: [
            { order: 1, tile: "9m", riichi: false, tsumogiri: false, confidence: 1 },
            { order: 2, tile: "8m", riichi: false, tsumogiri: false, confidence: 1 },
          ],
        },
        south: {},
        west: {},
        north: {},
      },
    });

    const state = buildPlaybackState(k, 1);
    // 撮影スナップショットの手牌はそのまま（配牌前提の前進再生で崩さない）。
    expect(state.seats.east.hand.map((t) => t.tile)).toEqual(["1m", "2m", "3m"]);
    // 河は1手ぶんだけ見せる。
    expect(state.seats.east.river.map((d) => d.tile)).toEqual(["9m"]);
    expect(state.activeDraw).toBeNull();
  });

  it("直近に河へ置かれた打牌の位置（activeDiscard）を返す。0手目は null", () => {
    const k = kifu({
      seats: {
        east: { hand: hand(["1m", "2m", "3m"]) },
        south: { hand: hand(["4m", "5m"]) },
        west: {},
        north: {},
      },
      timeline: [
        discard({ seat: "east", tile: "1m", draw: "6m" }),
        discard({ seat: "south", tile: "4m", draw: "7m" }),
        discard({ seat: "east", tile: "2m", draw: "8m" }),
      ],
    });

    expect(buildPlaybackState(k, 0).activeDiscard).toBeNull();
    expect(buildPlaybackState(k, 1).activeDiscard).toEqual({ seat: "east", riverIndex: 0 });
    expect(buildPlaybackState(k, 2).activeDiscard).toEqual({ seat: "south", riverIndex: 0 });
    expect(buildPlaybackState(k, 3).activeDiscard).toEqual({ seat: "east", riverIndex: 1 });
  });

  it("未編集（timeline 空）でも河に置いた直近打牌を activeDiscard として返す", () => {
    const k = kifu({
      seats: {
        east: {
          river: [
            { order: 1, tile: "9m", riichi: false, tsumogiri: false, confidence: 1 },
            { order: 2, tile: "8m", riichi: false, tsumogiri: false, confidence: 1 },
          ],
        },
        south: {},
        west: {},
        north: {},
      },
    });

    expect(buildPlaybackState(k, 2).activeDiscard).toEqual({ seat: "east", riverIndex: 1 });
  });

  it("playbackKifu は再生局面の seats と供託を Kifu として返す", () => {
    const k = kifu({
      seats: { east: { hand: hand(["1m", "2m"]) }, south: {}, west: {}, north: {} },
      timeline: [discard({ tile: "1m" })],
    });

    const out = playbackKifu(k, 1);

    expect(out.seats.east.hand.map((t) => t.tile)).toEqual(["2m"]);
    expect(out.seats.east.river.map((d) => d.tile)).toEqual(["1m"]);
  });
});

describe("buildPlaybackFrame（web/mobile ビューア共通の再生フレーム導出）", () => {
  // 東の2打牌（親=東）。巡目・末尾判定・河の推移を1つの牌譜で見る。
  const base = () =>
    kifu({
      seats: { east: { hand: hand(["1m", "2m", "3m"]) }, south: {}, west: {}, north: {} },
      timeline: [discard({ tile: "1m", draw: "4m" }), discard({ tile: "2m", draw: "5m" })],
    });

  it("reveal=-1（初期の全表示）は全打牌を見せ、atEnd にはしない", () => {
    const f = buildPlaybackFrame({ kifu: base(), prevKifus: [], reveal: -1 });

    expect(f.shown).toBe(2);
    expect(f.order).toEqual(["east", "east"]);
    expect(f.viewKifu.seats.east.river.map((d) => d.tile)).toEqual(["1m", "2m"]);
    expect(f.atEnd).toBe(false);
  });

  it("reveal が打牌数以上なら atEnd（和了演出を出してよい）", () => {
    const f = buildPlaybackFrame({ kifu: base(), prevKifus: [], reveal: 2 });

    expect(f.atEnd).toBe(true);
    expect(f.shown).toBe(2);
  });

  it("途中の reveal は河をそこまでだけ見せ、巡目は親の打牌数（最小1）", () => {
    const zero = buildPlaybackFrame({ kifu: base(), prevKifus: [], reveal: 0 });
    expect(zero.viewKifu.seats.east.river).toEqual([]);
    expect(zero.curJunme).toBe(1); // 0巡は出さない

    const one = buildPlaybackFrame({ kifu: base(), prevKifus: [], reveal: 1 });
    expect(one.viewKifu.seats.east.river.map((d) => d.tile)).toEqual(["1m"]);
    expect(one.curJunme).toBe(1);
    expect(one.atEnd).toBe(false);
  });

  it("席の向き・親・開始持ち点（rules.start 起点）を導出する", () => {
    const f = buildPlaybackFrame({ kifu: base(), prevKifus: [], reveal: -1 });

    expect(f.bottomSeat).toBe("east");
    expect(f.dealer).toBe("east");
    const start = Number(base().rules.start);
    expect(f.startPoints).toEqual({ east: start, south: start, west: start, north: start });
  });
});

describe("tsumoWinDisplay / splitDrawnTile（ツモ和了牌を手牌の横に離す表示）", () => {
  const seats = (eastHand: string[]) => ({
    east: { hand: hand(eastHand) },
    south: {},
    west: {},
    north: {},
  });
  const tsumoAgari = { winner: "east", from: null, winTile: "5p" };
  const win = { seat: "east", tile: "5p" } as const;

  it("ツモ和了（from=null・winTile あり）だけ導出する", () => {
    expect(tsumoWinDisplay(kifu({ agari: [tsumoAgari], seats: seats(["1m"]) }))).toEqual(win);

    const ron = kifu({
      agari: [{ winner: "east", from: "south", winTile: "5p" }],
      seats: seats(["1m"]),
    });
    expect(tsumoWinDisplay(ron)).toBeNull();
    expect(tsumoWinDisplay(kifu({ agari: [{ winner: "east" }], seats: seats(["1m"]) }))).toBeNull();
    expect(tsumoWinDisplay(kifu({ seats: seats(["1m"]) }))).toBeNull();
  });

  it("splitDrawnTile: 理牌＋自席ならスロット振り分けのみ（手牌からは抜かない。除去は viewKifu 導出の責務）", () => {
    // 手牌に同種牌 5p が残っていても本体から抜かない（draw 半歩で手持ちの同種牌を誤って消さない）。
    const k = kifu({ seats: seats(["1m", "5p", "2m"]) });
    const split = splitDrawnTile(k.seats.east.hand, win, "east");

    expect(split.hand.map((t) => t.tile)).toEqual(["1m", "2m", "5p"]);
    expect(split.drawnTile).toBe("5p");
  });

  it("splitDrawnTile: 他家・スロットなしは理牌のみ（離す牌なし）", () => {
    const k = kifu({ seats: seats(["2m", "1m"]) });

    const other = splitDrawnTile(k.seats.east.hand, win, "south");
    expect(other.drawnTile).toBeNull();

    const none = splitDrawnTile(k.seats.east.hand, null, "east");
    expect(none.hand.map((t) => t.tile)).toEqual(["1m", "2m"]);
    expect(none.drawnTile).toBeNull();
  });

  it("buildPlaybackFrame: tsumoWin はツモ和了の有無だけを表す（表示タイミングは winDraw フェーズが決める）", () => {
    const k = kifu({
      agari: [tsumoAgari],
      seats: {
        east: { hand: hand(["1m"]), river: [{ order: 1, tile: "9m", confidence: 1 }] },
        south: {},
        west: {},
        north: {},
      },
    });

    // どの再生位置でも導出は同じ（スロットに描くかは stepDisplay の phase="winDraw" が決める）。
    expect(buildPlaybackFrame({ kifu: k, prevKifus: [], reveal: -1 }).tsumoWin).toEqual(win);
    expect(buildPlaybackFrame({ kifu: k, prevKifus: [], reveal: 0 }).tsumoWin).toEqual(win);
  });
});

describe("activeDrawnTile / stepDisplay（二段階ステップ演出の表示導出）", () => {
  // 東が 3m をツモって 1m を手出しする1手（配牌 [1m,9p]）＋ツモ和了なし。
  const stepKifu = () =>
    kifu({
      seats: { east: { hand: hand(["1m", "9p"]) }, south: {}, west: {}, north: {} },
      timeline: [discard({ draw: "3m", tile: "1m" })],
    });

  it("activeDrawnTile: 直近ステップのツモ牌を右端スロット表示の形で返す（不明は null）", () => {
    expect(activeDrawnTile(buildPlaybackState(stepKifu(), 1))).toEqual({
      seat: "east",
      tile: "3m",
    });
    // ツモ不明（draw=null）・0手目は null。
    const noDraw = kifu({
      seats: { east: { hand: hand(["1m"]) }, south: {}, west: {}, north: {} },
      timeline: [discard({ draw: null, tile: "1m" })],
    });
    expect(activeDrawnTile(buildPlaybackState(noDraw, 1))).toBeNull();
    expect(activeDrawnTile(buildPlaybackState(stepKifu(), 0))).toBeNull();
  });

  it("stepDisplay: draw 段階は1手前の盤面＋右端スロットにツモ牌（河にはまだ落とさない）", () => {
    const k = stepKifu();
    const frame = buildPlaybackFrame({ kifu: k, prevKifus: [], reveal: 1 });
    const prevKifu = playbackKifu(k, 0);

    const draw = stepDisplay("draw", frame, prevKifu);
    expect(draw.drawing).toBe(true);
    expect(draw.kifu.seats.east.river).toEqual([]); // 盤面は1手前
    expect(draw.drawnTile).toEqual({ seat: "east", tile: "3m" });
    expect(draw.animateDiscard).toBeNull();
  });

  it("stepDisplay: drop 段階は現在の盤面＋直近打牌に drop 演出（スロットは空）", () => {
    const k = stepKifu();
    const frame = buildPlaybackFrame({ kifu: k, prevKifus: [], reveal: 1 });

    const drop = stepDisplay("drop", frame, null);
    expect(drop.drawing).toBe(false);
    expect(drop.kifu.seats.east.river.map((d) => d.tile)).toEqual(["1m"]);
    expect(drop.animateDiscard).toEqual({ seat: "east", index: 0 });
    expect(drop.drawnTile).toBeNull();
  });

  it("stepDisplay: フェーズなし（ジャンプ・初期表示）は現在の盤面のみ（演出なし）", () => {
    const k = stepKifu();
    const frame = buildPlaybackFrame({ kifu: k, prevKifus: [], reveal: 1 });

    const idle = stepDisplay(null, frame, null);
    expect(idle.drawing).toBe(false);
    expect(idle.animateDiscard).toBeNull();
    expect(idle.kifu.seats.east.river.map((d) => d.tile)).toEqual(["1m"]);
  });

  it("stepDisplay: ツモ和了牌は winDraw フェーズだけスロットに出す（末尾到達・ジャンプでは出さない）", () => {
    const k = kifu({
      agari: [{ winner: "east", from: null, winTile: "5p" }],
      seats: {
        east: { hand: hand(["1m"]), river: [{ order: 1, tile: "9m", confidence: 1 }] },
        south: {},
        west: {},
        north: {},
      },
    });
    const frame = buildPlaybackFrame({ kifu: k, prevKifus: [], reveal: 1 });

    // 「次ボタンで和了牌をツモる」半歩（winDraw）でだけ離して見せる。
    expect(stepDisplay("winDraw", frame, null).drawnTile).toEqual({ seat: "east", tile: "5p" });
    expect(stepDisplay("drop", frame, null).drawnTile).toBeNull();
    expect(stepDisplay(null, frame, null).drawnTile).toBeNull();
  });
});

describe("stepHasDraw（その手にツモ半歩があるか）", () => {
  it("timeline の該当手に draw があれば true、無ければ false", () => {
    const k = kifu({
      seats: { east: { hand: hand(["1m", "2m"]) }, south: {}, west: {}, north: {} },
      timeline: [
        discard({ draw: "3m", tile: "1m" }),
        discard({ draw: null, tile: "2m" }),
        discard({ draw: "4m", tile: "4m", tsumogiri: true }),
      ],
    });

    expect(stepHasDraw(k, 1)).toBe(true);
    expect(stepHasDraw(k, 2)).toBe(false); // ツモ不明の手は半歩なし
    expect(stepHasDraw(k, 3)).toBe(true); // ツモ切りも半歩あり
    expect(stepHasDraw(k, 0)).toBe(false);
    expect(stepHasDraw(k, 4)).toBe(false); // 範囲外
  });

  it("未編集（timeline 空）はスナップショット手牌のため常に false", () => {
    const k = kifu({
      seats: {
        east: { hand: hand(["1m"]), river: [{ order: 1, tile: "9m", confidence: 1 }] },
        south: {},
        west: {},
        north: {},
      },
    });

    expect(stepHasDraw(k, 1)).toBe(false);
  });
});

describe("ツモ和了牌は手牌本体に混ぜない（frame.viewKifu の時点で抜く。winDraw でスロットに現れる）", () => {
  // スナップショット手牌（和了牌 5p 込みの14枚型を簡略化した3枚）＋ツモ和了。
  const snapKifu = () =>
    kifu({
      agari: [{ winner: "east", from: null, winTile: "5p" }],
      seats: {
        east: {
          hand: hand(["1m", "5p", "2m"]),
          river: [{ order: 1, tile: "9m", confidence: 1 }],
        },
        south: {},
        west: {},
        north: {},
      },
    });

  it("viewKifu の手牌から和了牌1枚を抜く（卓面・和了シート・情報パネルの全消費者で一致させる）", () => {
    const frame = buildPlaybackFrame({ kifu: snapKifu(), prevKifus: [], reveal: -1 });

    expect(frame.viewKifu.seats.east.hand.map((t) => t.tile)).toEqual(["1m", "2m"]);
    // stepDisplay 経由（卓面）も同じ盤面を素通しで使う。
    for (const phase of [null, "drop", "winDraw"] as const) {
      expect(stepDisplay(phase, frame, null).kifu.seats.east.hand.map((t) => t.tile)).toEqual([
        "1m",
        "2m",
      ]);
    }
  });

  it("和了牌と同種の牌が複数あっても抜くのは1枚だけ", () => {
    const k = kifu({
      agari: [{ winner: "east", from: null, winTile: "5p" }],
      seats: {
        east: { hand: hand(["5p", "5p", "1m"]), river: [{ order: 1, tile: "9m", confidence: 1 }] },
        south: {},
        west: {},
        north: {},
      },
    });
    const frame = buildPlaybackFrame({ kifu: k, prevKifus: [], reveal: -1 });

    expect(frame.viewKifu.seats.east.hand.map((t) => t.tile)).toEqual(["5p", "1m"]);
  });

  it("編集済（13枚型・手牌に和了牌なし）とロンは手牌を触らない", () => {
    const edited = kifu({
      agari: [{ winner: "east", from: null, winTile: "5p" }],
      seats: {
        east: { hand: hand(["1m", "2m"]), river: [{ order: 1, tile: "9m", confidence: 1 }] },
        south: {},
        west: {},
        north: {},
      },
    });
    const f1 = buildPlaybackFrame({ kifu: edited, prevKifus: [], reveal: -1 });
    expect(f1.viewKifu.seats.east.hand.map((t) => t.tile)).toEqual(["1m", "2m"]);

    const ron = kifu({
      agari: [{ winner: "east", from: "south", winTile: "5p" }],
      seats: {
        east: { hand: hand(["1m", "5p"]), river: [{ order: 1, tile: "9m", confidence: 1 }] },
        south: {},
        west: {},
        north: {},
      },
    });
    const f2 = buildPlaybackFrame({ kifu: ron, prevKifus: [], reveal: -1 });
    expect(f2.viewKifu.seats.east.hand.map((t) => t.tile)).toEqual(["1m", "5p"]);
  });
});
