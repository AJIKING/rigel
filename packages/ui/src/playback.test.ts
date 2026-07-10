import { KifuSchema, type Kifu, type TimelineEvent } from "@rigel/schema";
import { describe, expect, it } from "vitest";
import {
  buildPlaybackFrame,
  buildPlaybackState,
  drawnTileIndex,
  playbackKifu,
  splitTsumoHand,
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

describe("drawnTileIndex（手牌に入ったツモ牌の表示位置）", () => {
  it("手出し後のツモ牌の位置を理牌後の並びで返す", () => {
    const k = kifu({
      // 配牌 1m,9p → 3m をツモって 1m を切る → 手牌は理牌で [9p, 3m] ではなく [3m, 9p]。
      seats: { east: { hand: hand(["1m", "9p"]) }, south: {}, west: {}, north: {} },
      timeline: [discard({ draw: "3m", tile: "1m" })],
    });

    const state = buildPlaybackState(k, 1);

    expect(drawnTileIndex(state)).toEqual({ seat: "east", index: 0 });
  });

  it("ツモ切りは手牌に入らないので null（河の drop 演出だけにする）", () => {
    const k = kifu({
      seats: { east: { hand: hand(["1m", "2m"]) }, south: {}, west: {}, north: {} },
      timeline: [discard({ draw: "3m", tile: "3m", tsumogiri: true })],
    });

    const state = buildPlaybackState(k, 1);

    expect(drawnTileIndex(state)).toBeNull();
  });

  it("ツモ不明（draw=null や未編集）は null", () => {
    const k = kifu({
      seats: { east: { hand: hand(["1m"]) }, south: {}, west: {}, north: {} },
      timeline: [discard({ draw: null, tile: "1m" })],
    });

    expect(drawnTileIndex(buildPlaybackState(k, 1))).toBeNull();
    expect(drawnTileIndex(buildPlaybackState(k, 0))).toBeNull();
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

describe("tsumoWinDisplay / splitTsumoHand（ツモ和了牌を手牌の横に離す表示）", () => {
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

  it("splitTsumoHand: スナップショット手牌（和了牌入り）は理牌して該当1枚を本体から抜く", () => {
    const k = kifu({ seats: seats(["1m", "5p", "2m"]) });
    const split = splitTsumoHand(k.seats.east.hand, win, "east");

    expect(split.hand.map((t) => t.tile)).toEqual(["1m", "2m"]);
    expect(split.tsumoTile).toBe("5p");
  });

  it("splitTsumoHand: 編集済（和了牌を含まない13枚型）は本体そのまま＋14枚目として返す", () => {
    const k = kifu({ seats: seats(["1m", "2m"]) });
    const split = splitTsumoHand(k.seats.east.hand, win, "east");

    expect(split.hand.map((t) => t.tile)).toEqual(["1m", "2m"]);
    expect(split.tsumoTile).toBe("5p");
  });

  it("splitTsumoHand: 他家・ツモ和了なしは理牌のみ（離す牌なし）", () => {
    const k = kifu({ seats: seats(["2m", "1m"]) });

    const other = splitTsumoHand(k.seats.east.hand, win, "south");
    expect(other.tsumoTile).toBeNull();

    const none = splitTsumoHand(k.seats.east.hand, null, "east");
    expect(none.hand.map((t) => t.tile)).toEqual(["1m", "2m"]);
    expect(none.tsumoTile).toBeNull();
  });

  it("buildPlaybackFrame: 最終局面（初期の全表示含む）だけ frame.tsumoWin を出す", () => {
    const k = kifu({
      agari: [tsumoAgari],
      seats: {
        east: { hand: hand(["1m"]), river: [{ order: 1, tile: "9m", confidence: 1 }] },
        south: {},
        west: {},
        north: {},
      },
    });

    expect(buildPlaybackFrame({ kifu: k, prevKifus: [], reveal: -1 }).tsumoWin).toEqual(win);
    expect(buildPlaybackFrame({ kifu: k, prevKifus: [], reveal: 1 }).tsumoWin).toEqual(win);
    expect(buildPlaybackFrame({ kifu: k, prevKifus: [], reveal: 0 }).tsumoWin).toBeNull();
  });
});
