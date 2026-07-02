import { KifuSchema, type Kifu, type TimelineEvent } from "@rigel/schema";
import { describe, expect, it } from "vitest";
import {
  buildTimelineFromSeats,
  deriveTimeline,
  syncSeatsFromTimeline,
  timelineToSeats,
  timelineTurns,
} from "./timeline";

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
});
