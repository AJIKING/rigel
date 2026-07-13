import { KifuSchema, type Kifu, type TimelineEvent } from "@rigel/schema";
import { describe, expect, it } from "vitest";
import {
  buildTimelineFromSeats,
  deriveTimeline,
  nextDiscardSeat,
  reconcileTimeline,
  syncSeatsFromTimeline,
  timelineToSeats,
  timelineTurns,
} from "./timeline";

/** テスト用: 河の1牌（order は呼び出し側で連番指定）。 */
const river = (
  order: number,
  tile: string,
  extra: { riichi?: boolean; tsumogiri?: boolean } = {},
) => ({
  order,
  tile: tile as never,
  riichi: extra.riichi ?? false,
  tsumogiri: extra.tsumogiri ?? false,
  confidence: 1,
});
const pon = (from: string) => ({
  type: "pon" as const,
  tiles: [
    { tile: "5z" as never, confidence: 1 },
    { tile: "5z" as never, confidence: 1 },
    { tile: "5z" as never, confidence: 1 },
  ],
  from: from as never,
});
const discKinds = (k: { timeline: unknown[] }) =>
  (k.timeline as { kind: string; seat: string; tile?: string }[])
    .filter((e) => e.kind === "discard")
    .map((e) => `${e.seat}:${e.tile}`);

const kifu = (over: Record<string, unknown> = {}): Kifu =>
  KifuSchema.parse({
    schemaVersion: "1.0.0",
    capturedAt: "2026-06-28T00:00:00.000Z",
    seats: { east: {}, south: {}, west: {}, north: {} },
    ...over,
  });

const disc = (seat: TimelineEvent["seat"], tile: string): TimelineEvent => ({
  kind: "discard",
  seat,
  draw: null,
  tile: tile as never,
  tsumogiri: false,
  riichi: false,
  calledBy: null,
  confidence: 1,
});

describe("buildTimelineFromSeats（席ごと→輪番タイムライン移行）", () => {
  it("親起点の輪番（東→南→西→北）で打牌を並べる", () => {
    const k = kifu({
      meta: { dealer: "east" },
      seats: {
        east: {
          hand: [],
          melds: [],
          river: [{ order: 1, tile: "1m", riichi: false, tsumogiri: false, confidence: 1 }],
        },
        south: {
          hand: [],
          melds: [],
          river: [{ order: 1, tile: "2p", riichi: false, tsumogiri: false, confidence: 1 }],
        },
        west: { hand: [], melds: [], river: [] },
        north: { hand: [], melds: [], river: [] },
      },
    });
    const tl = buildTimelineFromSeats(k);
    expect(tl.map((e) => e.kind === "discard" && `${e.seat}:${e.tile}`)).toEqual([
      "east:1m",
      "south:2p",
    ]);
  });
});

describe("deriveTimeline", () => {
  it("timeline があればそれを返す", () => {
    const tl = [disc("east", "1m")];
    expect(deriveTimeline(kifu({ timeline: tl }))).toEqual(tl);
  });
  it("timeline が空なら席ごとから構築する", () => {
    const k = kifu({
      seats: {
        east: {
          hand: [],
          melds: [],
          river: [{ order: 1, tile: "1m", riichi: false, tsumogiri: false, confidence: 1 }],
        },
        south: {},
        west: {},
        north: {},
      },
    });
    expect(deriveTimeline(k)).toHaveLength(1);
  });
});

describe("timelineTurns（巡目=親の打牌ごとに+1）", () => {
  it("親の打牌のたびに巡目が上がる", () => {
    const tl = [disc("east", "1m"), disc("south", "2p"), disc("east", "3s"), disc("west", "4m")];
    expect(timelineTurns(tl, "east")).toEqual([1, 1, 2, 2]);
  });
});

describe("timelineToSeats / syncSeatsFromTimeline", () => {
  it("timeline から席ごと river/melds を導出し order を振り直す", () => {
    const tl = [disc("east", "1m"), disc("east", "2m")];
    const seats = timelineToSeats(tl);
    expect(seats.east.river.map((d) => `${d.order}:${d.tile}`)).toEqual(["1:1m", "2:2m"]);
  });
  it("hand は保持したまま river/melds を同期する", () => {
    const k = kifu({
      seats: {
        east: { hand: [{ tile: "5z", confidence: 1 }], melds: [], river: [] },
        south: {},
        west: {},
        north: {},
      },
      timeline: [disc("east", "1m")],
    });
    const synced = syncSeatsFromTimeline(k);
    expect(synced.seats.east.hand).toHaveLength(1); // 手牌は残る
    expect(synced.seats.east.river.map((d) => d.tile)).toEqual(["1m"]);
  });

  it("リーチ(横向き)と鳴きが timeline→盤面へ同期される", () => {
    const k = kifu({
      timeline: [
        {
          kind: "discard",
          seat: "east",
          draw: null,
          tile: "1z",
          tsumogiri: false,
          riichi: true,
          confidence: 1,
        },
        {
          kind: "meld",
          seat: "south",
          meld: {
            type: "pon",
            tiles: [{ tile: "5z" }, { tile: "5z" }, { tile: "5z" }],
            from: "east",
          },
        },
      ],
    });
    const synced = syncSeatsFromTimeline(k);
    // リーチ牌は river に riichi:true で入る → 盤面は lay(横向き)で描画。
    expect(synced.seats.east.river[0]).toMatchObject({ tile: "1z", riichi: true });
    // 鳴きは melds に入る → 盤面は melds を描画。
    expect(synced.seats.south.melds[0]).toMatchObject({ type: "pon", from: "east" });
  });
});

describe("鳴かれた捨て牌（calledBy）の往復", () => {
  it("timeline→盤面: 打牌イベントの calledBy が river へ同期される", () => {
    const k = kifu({
      timeline: [{ ...disc("east", "5p"), calledBy: "south" }, disc("south", "1m")],
    });
    const synced = syncSeatsFromTimeline(k);
    expect(synced.seats.east.river[0]).toMatchObject({ tile: "5p", calledBy: "south" });
    expect(synced.seats.south.river[0]).toMatchObject({ tile: "1m", calledBy: null });
  });

  it("盤面→timeline: buildTimelineFromSeats が river の calledBy を引き継ぐ", () => {
    const k = kifu({
      seats: {
        east: { river: [{ ...river(1, "5p"), calledBy: "south" }] },
        south: {},
        west: {},
        north: {},
      },
    });
    const tl = buildTimelineFromSeats(k);
    expect(tl[0]).toMatchObject({ kind: "discard", seat: "east", tile: "5p", calledBy: "south" });
  });

  it("reconcileTimeline: 盤面編集後も river の calledBy が timeline に保たれる", () => {
    const k = kifu({
      seats: {
        east: { river: [{ ...river(1, "5p"), calledBy: "south" }] },
        south: {},
        west: {},
        north: {},
      },
      timeline: [disc("east", "5p")], // 旧 timeline は calledBy なし（seats 側が編集面）
    });
    const next = reconcileTimeline(k);
    const first = next.timeline[0];
    if (first?.kind !== "discard") throw new Error("discard expected");
    expect(first.calledBy).toBe("south");
    expect(next.seats.east.river[0]?.calledBy).toBe("south");
  });
});

describe("nextDiscardSeat（手順追加時の席＝東南西北×巡目を順に埋める）", () => {
  const d = (seat: TimelineEvent["seat"]) => disc(seat, "1m");

  it("親=東のとき、打牌数に応じて 東→南→西→北→東… と回る", () => {
    expect(nextDiscardSeat([], "east")).toBe("east"); // 1件目=東
    expect(nextDiscardSeat([d("east")], "east")).toBe("south"); // 2件目=南
    expect(nextDiscardSeat([d("east"), d("south")], "east")).toBe("west"); // 3件目=西
    expect(nextDiscardSeat([d("east"), d("south"), d("west")], "east")).toBe("north"); // 4件目=北
    // 1巡が埋まったら次巡の1打目＝東（新巡目）。
    expect(nextDiscardSeat([d("east"), d("south"), d("west"), d("north")], "east")).toBe("east");
  });

  it("親起点で順番が回る（親=南なら 南→西→北→東）", () => {
    expect(nextDiscardSeat([], "south")).toBe("south");
    expect(nextDiscardSeat([d("south")], "south")).toBe("west");
  });

  it("鳴きは席サイクルに数えない（打牌のみで東南西北を回す）", () => {
    const meld = { kind: "meld" as const, seat: "east" as const, meld: pon("north") };
    expect(nextDiscardSeat([d("east"), meld], "east")).toBe("south"); // 打牌1件→次は南
  });
});

describe("reconcileTimeline（盤面編集→timeline を巡目正規化で同期）", () => {
  it("timeline 非空でも打牌は seats から東南西北×巡目順に正規化される", () => {
    // 席ごとに入力した想定（east 2枚・south 1枚）だが、timeline は古い（east 1枚のみ）。
    const k = kifu({
      meta: { dealer: "east" },
      seats: {
        east: { hand: [], melds: [], river: [river(1, "1m"), river(2, "3m")] },
        south: { hand: [], melds: [], river: [river(1, "2p")] },
        west: {},
        north: {},
      },
      timeline: [disc("east", "1m")],
    });
    // 1巡目(east,south)→2巡目(east) の順。south:2p が末尾集中せず巡目位置に入る。
    expect(discKinds(reconcileTimeline(k))).toEqual(["east:1m", "south:2p", "east:3m"]);
  });

  it("再正規化しても旧 timeline のツモ牌(draw)を席内 index で引き継ぐ", () => {
    const k = kifu({
      meta: { dealer: "east" },
      seats: {
        east: { hand: [], melds: [], river: [river(1, "1m")] },
        south: { hand: [], melds: [], river: [river(1, "2p")] },
        west: {},
        north: {},
      },
      timeline: [
        {
          kind: "discard",
          seat: "east",
          draw: "9s",
          tile: "1m",
          tsumogiri: false,
          riichi: false,
          confidence: 1,
        },
      ],
    });
    const out = reconcileTimeline(k).timeline.find(
      (e) => e.kind === "discard" && e.seat === "east",
    );
    expect(out?.kind === "discard" && out.draw).toBe("9s");
  });

  it("鳴きは直前の打牌の後（アンカー）を保って再挿入される", () => {
    // 旧 timeline: east:1m, [pon south], east:3m。south:2p を盤面で足した状態を正規化。
    const k = kifu({
      meta: { dealer: "east" },
      seats: {
        east: { hand: [], melds: [], river: [river(1, "1m"), river(2, "3m")] },
        south: { hand: [], melds: [pon("east")], river: [river(1, "2p")] },
        west: {},
        north: {},
      },
      timeline: [
        disc("east", "1m"),
        { kind: "meld", seat: "south", meld: pon("east") },
        disc("east", "3m"),
      ],
    });
    const kinds = reconcileTimeline(k).timeline.map((e) =>
      e.kind === "discard" ? `d:${e.seat}:${e.tile}` : `m:${e.seat}`,
    );
    // 打牌は巡目順、鳴きは east:1m の直後（アンカー）を保つ。
    expect(kinds).toEqual(["d:east:1m", "m:south", "d:south:2p", "d:east:3m"]);
  });

  it("timeline が空なら何もしない（新規牌譜は buildTimelineFromSeats が既に巡目順）", () => {
    const k = kifu({
      seats: {
        east: { hand: [], melds: [], river: [river(1, "1m")] },
        south: {},
        west: {},
        north: {},
      },
    });
    expect(reconcileTimeline(k).timeline).toEqual([]);
  });
});
