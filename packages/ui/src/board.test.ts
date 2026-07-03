import { KifuSchema } from "@rigel/schema";
import { describe, expect, it } from "vitest";
import { buildRiverPlayback, chunk, revealCounts, roundName, windOf } from "./board";

function kifuWith(rivers: Partial<Record<"east" | "south" | "west" | "north", string[]>>) {
  const seat = (tiles: string[] = []) => ({
    hand: [],
    river: tiles.map((t, i) => ({ order: i + 1, tile: t, riichi: false, confidence: 1 })),
    melds: [],
  });
  return KifuSchema.parse({
    schemaVersion: "1.0.0",
    capturedAt: "2026-06-28T12:00:00.000Z",
    cameraBottomSeat: "east",
    seats: {
      east: seat(rivers.east),
      south: seat(rivers.south),
      west: seat(rivers.west),
      north: seat(rivers.north),
    },
  });
}

describe("windOf", () => {
  it("親を東に、以降を席順で回す", () => {
    expect(windOf("east", "east")).toBe("東");
    expect(windOf("south", "east")).toBe("南");
    expect(windOf("east", "south")).toBe("北"); // 親が南なら東家は北
  });
});

describe("roundName", () => {
  it("0始まりのインデックスを東一局〜に", () => {
    expect(roundName(0)).toBe("東一局");
    expect(roundName(3)).toBe("東四局");
    expect(roundName(4)).toBe("南一局");
  });
});

describe("chunk", () => {
  it("n個ずつに分割する", () => {
    expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
  });
});

describe("buildRiverPlayback", () => {
  it("親起点の輪番で打牌順を作り、親の打牌ごとに巡目境界を刻む", () => {
    // east=親。各家2枚ずつ。順序は 東→南→西→北 を2巡。
    const kifu = kifuWith({
      east: ["1m", "2m"],
      south: ["3m", "4m"],
      west: ["5m", "6m"],
      north: ["7m", "8m"],
    });
    const pb = buildRiverPlayback(kifu, "east");
    expect(pb.order).toEqual(["east", "south", "west", "north", "east", "south", "west", "north"]);
    expect(pb.maxTurn).toBe(2);
    // 親(east)の打牌は index 0 と 4 → 境界は 1 と 5。
    expect(pb.junmeStops).toEqual([1, 5]);
  });

  it("revealCounts は shown までの各席の枚数を数える", () => {
    const kifu = kifuWith({ east: ["1m", "2m"], south: ["3m"], west: [], north: [] });
    const pb = buildRiverPlayback(kifu, "east");
    // order = [east, south, east]
    expect(revealCounts(pb.order, 2)).toEqual({ east: 1, south: 1, west: 0, north: 0 });
    expect(revealCounts(pb.order, pb.order.length)).toEqual({
      east: 2,
      south: 1,
      west: 0,
      north: 0,
    });
  });
});
