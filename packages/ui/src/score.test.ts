import { describe, expect, it } from "vitest";
import { KifuSchema, RULE_PRESETS, type Agari, type Seat } from "@rigel/schema";
import { handScore, kifuScore } from "./score";

const R = RULE_PRESETS.mleague; // kiriage:false, kazoe:true

function kifuWith(agari: Partial<Agari> | null, dealer: Seat | null) {
  return KifuSchema.parse({
    schemaVersion: "1.0.0",
    capturedAt: "2026-06-28T00:00:00.000Z",
    seats: { east: {}, south: {}, west: {}, north: {} },
    meta: { dealer },
    agari,
  });
}

describe("handScore（打点計算）", () => {
  it("子3飜40符ロン = 5200", () => {
    const s = handScore({ han: 3, fu: 40, dealer: false, tsumo: false }, R);
    expect(s.total).toBe(5200);
    expect(s.payment).toEqual({ ron: 5200 });
    expect(s.limit).toBeNull();
  });

  it("子4飜30符ロン = 7700（切り上げ無し）", () => {
    expect(handScore({ han: 4, fu: 30, dealer: false, tsumo: false }, R).total).toBe(7700);
  });

  it("切り上げ満貫ありなら子4飜30符ロン = 8000（満貫）", () => {
    const s = handScore({ han: 4, fu: 30, dealer: false, tsumo: false }, { ...R, kiriage: true });
    expect(s.total).toBe(8000);
    expect(s.limit).toBe("満貫");
  });

  it("子満貫ロン(5飜) = 8000 / 親満貫ロン = 12000", () => {
    expect(handScore({ han: 5, fu: 30, dealer: false, tsumo: false }, R).total).toBe(8000);
    expect(handScore({ han: 5, fu: 30, dealer: true, tsumo: false }, R).total).toBe(12000);
  });

  it("子3飜30符ツモ = 1000/2000（合計4000）", () => {
    const s = handScore({ han: 3, fu: 30, dealer: false, tsumo: true }, R);
    expect(s.payment).toEqual({ fromDealer: 2000, fromNonDealer: 1000 });
    expect(s.total).toBe(4000);
  });

  it("親満貫ツモ = 4000オール（合計12000）", () => {
    const s = handScore({ han: 5, fu: 30, dealer: true, tsumo: true }, R);
    expect(s.payment).toEqual({ each: 4000 });
    expect(s.total).toBe(12000);
  });

  it("跳満/倍満/三倍満のランク（子ロン）", () => {
    expect(handScore({ han: 6, fu: 30, dealer: false, tsumo: false }, R)).toMatchObject({
      limit: "跳満",
      total: 12000,
    });
    expect(handScore({ han: 8, fu: 30, dealer: false, tsumo: false }, R).total).toBe(16000);
    expect(handScore({ han: 11, fu: 30, dealer: false, tsumo: false }, R).total).toBe(24000);
  });

  it("数え役満: 13飜は kazoe on で役満(子ロン32000)、off で三倍満(24000)", () => {
    expect(handScore({ han: 13, fu: 30, dealer: false, tsumo: false }, R)).toMatchObject({
      limit: "役満",
      total: 32000,
    });
    expect(
      handScore({ han: 13, fu: 30, dealer: false, tsumo: false }, { ...R, kazoe: false }),
    ).toMatchObject({ limit: "三倍満", total: 24000 });
  });

  it("base>=2000 は満貫に切り詰める（子4飜40符ロン = 8000）", () => {
    expect(handScore({ han: 4, fu: 40, dealer: false, tsumo: false }, R).total).toBe(8000);
  });
});

describe("kifuScore（Kifu から打点を計算）", () => {
  it("和了(agari)が無ければ null", () => {
    expect(kifuScore(kifuWith(null, null))).toBeNull();
  });

  it("和了者が親なら親レートで計算する（東家ロン5飜 = 12000）", () => {
    const k = kifuWith(
      { winner: "east", from: "south", fu: 30, yaku: [{ name: "満貫役", han: 5 }] },
      "east",
    );
    expect(kifuScore(k)?.total).toBe(12000);
  });

  it("子のツモは親/子で支払いを分ける（南家ツモ3飜30符）", () => {
    const k = kifuWith(
      { winner: "south", from: null, fu: 30, yaku: [{ name: "役", han: 1 }], dora: 2 },
      "east",
    );
    // 役1 + ドラ2 = 3飜30符
    expect(kifuScore(k)?.payment).toEqual({ fromDealer: 2000, fromNonDealer: 1000 });
  });

  it("役の飜＋表/赤/裏ドラ枚数を合算して飜にする", () => {
    const k = kifuWith(
      { winner: "east", from: "south", fu: 40, yaku: [{ name: "立直", han: 1 }], dora: 1, aka: 1 },
      "west",
    );
    // 立直1 + ドラ1 + 赤1 = 3飜40符（子ロン） = 5200
    expect(kifuScore(k)?.total).toBe(5200);
  });
});
