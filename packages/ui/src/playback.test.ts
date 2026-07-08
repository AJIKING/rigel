import { KifuSchema, type Kifu, type TimelineEvent } from "@rigel/schema";
import { describe, expect, it } from "vitest";
import { buildPlaybackState, playbackKifu } from "./playback";

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
