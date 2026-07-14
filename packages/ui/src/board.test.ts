import { KifuSchema } from "@rigel/schema";
import { describe, expect, it } from "vitest";
import {
  buildRiverPlayback,
  chunk,
  hasPlayerPoints,
  resultLabel,
  revealCounts,
  roundHonbaLabel,
  roundName,
  roundNameForSeq,
  seatResult,
  windOf,
} from "./board";

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

describe("roundNameForSeq", () => {
  it("局順(seq, 1始まり)を局名に（公開サブセットでも正しい局名になる）", () => {
    expect(roundNameForSeq(1)).toBe("東一局");
    expect(roundNameForSeq(3)).toBe("東三局");
    expect(roundNameForSeq(5)).toBe("南一局");
  });
  it("不正な seq(0以下) は東一局に丸める", () => {
    expect(roundNameForSeq(0)).toBe("東一局");
    expect(roundNameForSeq(-2)).toBe("東一局");
  });
});

describe("hasPlayerPoints", () => {
  const zero = { name: "", points: 0 };
  it("1人でもポイントが記録されていれば true", () => {
    expect(
      hasPlayerPoints({
        east: { name: "多井", points: 12.3 },
        south: zero,
        west: zero,
        north: zero,
      }),
    ).toBe(true);
    expect(
      hasPlayerPoints({ east: zero, south: { name: "", points: -0.1 }, west: zero, north: zero }),
    ).toBe(true);
  });
  it("全員 0.0（または players なし）は false（再生画面の既定でポイントを出さない）", () => {
    expect(hasPlayerPoints({ east: zero, south: zero, west: zero, north: zero })).toBe(false);
    expect(hasPlayerPoints(null)).toBe(false);
    expect(hasPlayerPoints(undefined)).toBe(false);
  });
});

describe("roundHonbaLabel", () => {
  it("局名＋本場（連荘＝同じ局順の局を区別する一覧・メニュー用の共通表記）", () => {
    expect(roundHonbaLabel(1, 0)).toBe("東一局 0本場");
    expect(roundHonbaLabel(1, 1)).toBe("東一局 1本場");
    expect(roundHonbaLabel(5, 2)).toBe("南一局 2本場");
  });
});

describe("resultLabel", () => {
  it("結果コードを日本語ラベルに（未設定は —）", () => {
    expect(resultLabel("ron")).toBe("ロン");
    expect(resultLabel("tsumo")).toBe("ツモ");
    expect(resultLabel("draw")).toBe("流局");
    expect(resultLabel(null)).toBe("—");
    expect(resultLabel(undefined)).toBe("—");
  });
});

describe("seatResult", () => {
  const ron = { winner: "east", from: "south" } as never;
  const tsumo = { winner: "west", from: null } as never;
  it("和了者はロン/ツモ、放銃者は放銃、無関係は空", () => {
    const agari = [ron, tsumo];
    expect(seatResult(agari, "east")).toBe("ロン");
    expect(seatResult(agari, "west")).toBe("ツモ");
    expect(seatResult(agari, "south")).toBe("放銃"); // ron の from
    expect(seatResult(agari, "north")).toBe("");
  });
  it("和了が無ければ全席 空", () => {
    expect(seatResult([], "east")).toBe("");
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
