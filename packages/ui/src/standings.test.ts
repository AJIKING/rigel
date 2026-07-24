import { KifuSchema, RulesSchema, type Kifu } from "@rigel/schema";
import { describe, expect, it } from "vitest";
import { agariDeltas, kyokuDeltas, notenDeltas, standings } from "./standings";

const kifu = (over: Record<string, unknown> = {}): Kifu =>
  KifuSchema.parse({
    schemaVersion: "1.0.0",
    capturedAt: "2026-06-28T00:00:00.000Z",
    meta: { dealer: "east", kyotaku: 0 },
    seats: { east: {}, south: {}, west: {}, north: {} },
    ...over,
  });

/** 席の河にリーチ宣言牌を1枚置く。 */
const riichiRiver = { river: [{ order: 1, tile: "1m", riichi: true }] };

describe("notenDeltas（流局の不聴罰符）", () => {
  it("1人聴牌: +3000 / 不聴3人 -1000", () => {
    expect(notenDeltas(["east"])).toEqual({ east: 3000, south: -1000, west: -1000, north: -1000 });
  });
  it("2人聴牌: +1500 / -1500", () => {
    expect(notenDeltas(["east", "south"])).toEqual({
      east: 1500,
      south: 1500,
      west: -1500,
      north: -1500,
    });
  });
  it("3人聴牌: +1000 / 不聴1人 -3000", () => {
    expect(notenDeltas(["east", "south", "west"])).toEqual({
      east: 1000,
      south: 1000,
      west: 1000,
      north: -3000,
    });
  });
  it("全員聴牌/全員不聴は移動なし", () => {
    const z = { east: 0, south: 0, west: 0, north: 0 };
    expect(notenDeltas([])).toEqual(z);
    expect(notenDeltas(["east", "south", "west", "north"])).toEqual(z);
  });
  it("重複席は1人扱い", () => {
    expect(notenDeltas(["east", "east"])).toEqual({
      east: 3000,
      south: -1000,
      west: -1000,
      north: -1000,
    });
  });
});

describe("kyokuDeltas（1局の点棒移動の合計＝和了・リーチ棒・ノーテン罰符）", () => {
  it("リーチ宣言者は -1000、和了者が卓上の宣言棒を総取りする", () => {
    const k = kifu({
      seats: { east: {}, south: riichiRiver, west: {}, north: {} },
      result: "ron",
      agari: [{ winner: "east", from: "south", winTile: "3m", yaku: [{ name: "断么九", han: 1 }] }],
    });
    const base = agariDeltas(k);
    const d = kyokuDeltas(k);
    // 宣言者（南）は和了の支払いに加えて宣言棒 -1000。和了者（東）は +1000。
    expect(d.south).toBe(base.south - 1000);
    expect(d.east).toBe(base.east + 1000);
    expect(d.west).toBe(base.west);
  });

  it("リーチ和了は自分の宣言棒が戻る（差し引き0）", () => {
    const k = kifu({
      seats: { east: riichiRiver, south: {}, west: {}, north: {} },
      result: "ron",
      agari: [{ winner: "east", from: "south", winTile: "3m", yaku: [{ name: "立直", han: 1 }] }],
    });
    expect(kyokuDeltas(k).east).toBe(agariDeltas(k).east); // -1000 +1000 で相殺
  });

  it("流局はノーテン罰符を精算し、宣言棒は戻らない（次局供託へ持ち越し）", () => {
    const k = kifu({
      seats: { east: {}, south: riichiRiver, west: {}, north: {} },
      result: "draw",
      tenpai: ["east"],
    });
    expect(kyokuDeltas(k)).toEqual({ east: 3000, south: -2000, west: -1000, north: -1000 });
  });

  it("ノーテン罰符なしルール（noten:false）では流局の罰符を精算しない", () => {
    const k = kifu({
      rules: RulesSchema.parse({ noten: false }),
      seats: { east: {}, south: {}, west: {}, north: {} },
      result: "draw",
      tenpai: ["east"],
    });
    expect(kyokuDeltas(k)).toEqual({ east: 0, south: 0, west: 0, north: 0 });
  });

  it("standings は流局のノーテン罰符・リーチ棒も持ち点に積む", () => {
    const draw = kifu({
      seats: { east: {}, south: riichiRiver, west: {}, north: {} },
      result: "draw",
      tenpai: ["east"],
    });
    const start = Number(draw.rules.start);
    expect(standings([draw], draw.rules)).toEqual({
      east: start + 3000,
      south: start - 2000,
      west: start - 1000,
      north: start - 1000,
    });
  });
});
