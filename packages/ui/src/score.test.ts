import { describe, expect, it } from "vitest";
import { RULE_PRESETS } from "@rigel/schema";
import { handScore } from "./score";

const R = RULE_PRESETS.mleague; // kiriage:false, kazoe:true

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
