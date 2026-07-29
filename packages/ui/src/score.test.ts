import { describe, expect, it } from "vitest";
import { KifuSchema, RULE_PRESETS, type Agari, type Seat } from "@rigel/schema";
import { handScore, kifuScore } from "./score";

const R = RULE_PRESETS.mleague; // kiriage:true, kazoe:false（Mリーグに数え役満は無い）

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

  it("切り上げ無し（天鳳等）なら子4飜30符ロン = 7700", () => {
    expect(
      handScore({ han: 4, fu: 30, dealer: false, tsumo: false }, { ...R, kiriage: false }).total,
    ).toBe(7700);
  });

  it("Mリーグ既定（切り上げ満貫あり）なら子4飜30符ロン = 8000（満貫）", () => {
    const s = handScore({ han: 4, fu: 30, dealer: false, tsumo: false }, R);
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

  it("数え役満: 13飜は kazoe on で役満(子ロン32000)、off（Mリーグ既定）で三倍満(24000)", () => {
    expect(
      handScore({ han: 13, fu: 30, dealer: false, tsumo: false }, { ...R, kazoe: true }),
    ).toMatchObject({ limit: "役満", total: 32000 });
    expect(handScore({ han: 13, fu: 30, dealer: false, tsumo: false }, R)).toMatchObject({
      limit: "三倍満",
      total: 24000,
    });
  });

  it("base>=2000 は満貫に切り詰める（子4飜40符ロン = 8000）", () => {
    expect(handScore({ han: 4, fu: 40, dealer: false, tsumo: false }, R).total).toBe(8000);
  });

  it("親の跳満/倍満/三倍満/役満ロン", () => {
    expect(handScore({ han: 6, fu: 30, dealer: true, tsumo: false }, R).total).toBe(18000);
    expect(handScore({ han: 8, fu: 30, dealer: true, tsumo: false }, R).total).toBe(24000);
    expect(handScore({ han: 11, fu: 30, dealer: true, tsumo: false }, R).total).toBe(36000);
    // 13飜は R（Mリーグ相当）だと数え役満なし=三倍満。役満は kazoe on で。
    expect(
      handScore({ han: 13, fu: 30, dealer: true, tsumo: false }, { ...R, kazoe: true }),
    ).toMatchObject({ total: 48000, limit: "役満" });
    expect(handScore({ han: 13, fu: 30, dealer: true, tsumo: false }, R)).toMatchObject({
      total: 36000,
      limit: "三倍満",
    });
  });

  it("子ツモ満貫 = 2000/4000（合計8000）", () => {
    const s = handScore({ han: 5, fu: 30, dealer: false, tsumo: true }, R);
    expect(s.payment).toEqual({ fromDealer: 4000, fromNonDealer: 2000 });
    expect(s.total).toBe(8000);
  });

  it("親ツモ跳満 = 6000オール（合計18000）", () => {
    const s = handScore({ han: 6, fu: 30, dealer: true, tsumo: true }, R);
    expect(s.payment).toEqual({ each: 6000 });
    expect(s.total).toBe(18000);
  });

  it("1飜30符の下限（子ロン1000 / 親ロン1500）", () => {
    expect(handScore({ han: 1, fu: 30, dealer: false, tsumo: false }, R).total).toBe(1000);
    expect(handScore({ han: 1, fu: 30, dealer: true, tsumo: false }, R).total).toBe(1500);
  });

  it("役満（子ロン32000 / 親ロン48000）", () => {
    expect(handScore({ han: 0, fu: 0, dealer: false, tsumo: false, yakuman: 1 }, R).total).toBe(
      32000,
    );
    expect(handScore({ han: 0, fu: 0, dealer: true, tsumo: false, yakuman: 1 }, R).total).toBe(
      48000,
    );
  });

  it("役満2つの複合は倍加する（子ロン64000）／compYakuman OFF なら単倍(32000)", () => {
    // 複合の倍加を握るのは compYakuman（役満の複合）。multiYakuman は
    // 四暗刻単騎等の「ダブル役満（役の格上げ）」で、待ち情報が無いため未実装（表示・記録のみ）。
    expect(handScore({ han: 0, fu: 0, dealer: false, tsumo: false, yakuman: 2 }, R)).toMatchObject({
      total: 64000,
      limit: "ダブル役満",
    });
    expect(
      handScore(
        { han: 0, fu: 0, dealer: false, tsumo: false, yakuman: 2 },
        { ...R, compYakuman: false },
      ),
    ).toMatchObject({ total: 32000, limit: "役満" });
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

  it("役満役を2つ選ぶとダブル役満になる（子ロン64000）", () => {
    const k = kifuWith(
      {
        winner: "south",
        from: "north",
        fu: 0,
        yaku: [
          { name: "大三元", han: 13 },
          { name: "字一色", han: 13 },
        ],
      },
      "east",
    );
    expect(kifuScore(k)).toMatchObject({ total: 64000, limit: "ダブル役満" });
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
