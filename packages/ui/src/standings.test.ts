import { describe, expect, it } from "vitest";
import { KifuSchema, RULE_PRESETS, type Agari, type Rules, type Seat } from "@rigel/schema";
import { agariDeltas, standings } from "./standings";

const R: Rules = RULE_PRESETS.mleague;

function kifu(opts: {
  agari?: Partial<Agari> | null;
  dealer?: Seat;
  honba?: number;
  kyotaku?: number;
}) {
  return KifuSchema.parse({
    schemaVersion: "1.0.0",
    capturedAt: "2026-06-28T00:00:00.000Z",
    seats: { east: {}, south: {}, west: {}, north: {} },
    meta: { dealer: opts.dealer ?? "east", honba: opts.honba ?? 0, kyotaku: opts.kyotaku ?? 0 },
    agari: opts.agari ?? null,
  });
}

describe("agariDeltas（1局の点棒移動）", () => {
  it("和了が無ければ全員0", () => {
    expect(agariDeltas(kifu({ agari: null }))).toEqual({ east: 0, south: 0, west: 0, north: 0 });
  });

  it("子ロン5200：放銃者が払い和了者が受ける", () => {
    const k = kifu({
      dealer: "east",
      agari: { winner: "south", from: "north", fu: 40, yaku: [{ name: "x", han: 3 }] },
    });
    const d = agariDeltas(k);
    expect(d.south).toBe(5200);
    expect(d.north).toBe(-5200);
    expect(d.east).toBe(0);
  });

  it("本場と供託を上乗せする（子ロン + 1本場 + 供託1）", () => {
    const k = kifu({
      dealer: "east",
      honba: 1,
      kyotaku: 1,
      agari: { winner: "south", from: "north", fu: 40, yaku: [{ name: "x", han: 3 }] },
    });
    const d = agariDeltas(k);
    // 5200 + 本場300 = 5500 を放銃者が払い、和了者は +供託1000。
    expect(d.north).toBe(-5500);
    expect(d.south).toBe(5500 + 1000);
  });

  it("親満貫ツモ：全員が4000払い親が受ける", () => {
    const k = kifu({
      dealer: "east",
      agari: { winner: "east", from: null, fu: 30, yaku: [{ name: "満貫", han: 5 }] },
    });
    const d = agariDeltas(k);
    expect(d.east).toBe(12000);
    expect(d.south).toBe(-4000);
    expect(d.west).toBe(-4000);
    expect(d.north).toBe(-4000);
  });
});

describe("standings（持ち点の累積）", () => {
  it("開始点から各局の増減を積む", () => {
    const logs = [
      kifu({
        dealer: "east",
        agari: { winner: "south", from: "north", fu: 40, yaku: [{ name: "x", han: 3 }] },
      }),
      kifu({
        dealer: "east",
        agari: { winner: "east", from: null, fu: 30, yaku: [{ name: "満貫", han: 5 }] },
      }),
    ];
    const s = standings(logs, R);
    // 開始25000。局1: south+5200/north-5200。局2: east+12000/他-4000。
    expect(s.east).toBe(25000 + 12000);
    expect(s.south).toBe(25000 + 5200 - 4000);
    expect(s.north).toBe(25000 - 5200 - 4000);
    expect(s.west).toBe(25000 - 4000);
    // 合計は 100000 で保存される。
    expect(s.east + s.south + s.west + s.north).toBe(100000);
  });
});
