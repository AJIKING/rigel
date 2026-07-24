import type { AiHandResponse, AiRiverResponse } from "@rigel/schema";
import { describe, expect, it } from "vitest";
import { evaluateHandTarget, evaluateRiverTarget } from "./response-accuracy";
import { parseTileToken } from "./truth";

const river = (discards: AiRiverResponse["discards"]): AiRiverResponse => ({
  discards,
  notes: "",
});

describe("evaluateRiverTarget（河1方向: AI応答 vs 正解トークン）", () => {
  const expected = ["1z", "*5s", "9p"].map(parseTileToken);

  it("全問正解なら tileAccuracy=1, riichiAccuracy=1", () => {
    const { result, warnings } = evaluateRiverTarget(
      expected,
      river([
        { order: 1, tile: "1z", riichi: false, tsumogiri: false },
        { order: 2, tile: "5s", riichi: true, tsumogiri: false },
        { order: 3, tile: "9p", riichi: false, tsumogiri: false },
      ]),
    );
    expect(result.tiles).toBe(3);
    expect(result.tileAccuracy).toBe(1);
    expect(result.riichiTotal).toBe(3);
    expect(result.riichiAccuracy).toBe(1);
    expect(result.misread).toBe(0);
    expect(warnings).toEqual([]);
  });

  it("白旗（null）を揚げずに間違えた牌を misread に数え、null は数えない", () => {
    const { result } = evaluateRiverTarget(
      expected,
      river([
        { order: 1, tile: "2z", riichi: false, tsumogiri: false }, // 白旗なし誤読
        { order: 2, tile: "5s", riichi: true, tsumogiri: false }, // 正解
        { order: 3, tile: null, riichi: false, tsumogiri: false }, // 白旗 → misread に数えない
      ]),
    );
    expect(result.tileCorrect).toBe(1);
    expect(result.asserted).toBe(2); // 牌コードを出したのは2枚
    expect(result.misread).toBe(1);
    expect(result.misreadRate).toBe(0.5);
  });

  it("order で整列してから比較する", () => {
    const { result } = evaluateRiverTarget(
      expected,
      river([
        { order: 3, tile: "9p", riichi: false, tsumogiri: false },
        { order: 1, tile: "1z", riichi: false, tsumogiri: false },
        { order: 2, tile: "5s", riichi: true, tsumogiri: false },
      ]),
    );
    expect(result.tileAccuracy).toBe(1);
  });

  it("予測が足りない位置は誤り扱い（正解が ? なら正解扱い）", () => {
    const { result, warnings } = evaluateRiverTarget(
      ["1z", "?"].map(parseTileToken),
      river([{ order: 1, tile: "1z", riichi: false, tsumogiri: false }]),
    );
    // 2枚目: 正解 null vs 予測なし(null) → 一致扱い
    expect(result.tileCorrect).toBe(2);
    expect(warnings).toEqual(["捨て牌の枚数が不一致: 正解 2 枚 / 予測 1 枚"]);
  });

  it("予測が多すぎたら警告し、発明された余剰牌は misread に数える", () => {
    const { result, warnings } = evaluateRiverTarget(
      ["1z"].map(parseTileToken),
      river([
        { order: 1, tile: "1z", riichi: false, tsumogiri: false },
        { order: 2, tile: "5s", riichi: false, tsumogiri: false }, // 発明（Never invent a tile 違反）
      ]),
    );
    expect(result.tiles).toBe(1);
    expect(result.asserted).toBe(2);
    expect(result.misread).toBe(1);
    expect(warnings).toEqual(["捨て牌の枚数が不一致: 正解 1 枚 / 予測 2 枚"]);
  });

  it("空ターゲット（正解0枚・予測0枚）は misreadRate=0（最悪値に化けない）", () => {
    const { result } = evaluateRiverTarget([], river([]));
    expect(result.misreadRate).toBe(0);
    expect(result.tileAccuracy).toBe(1); // 「正しく読めた率」は空なら満点のまま
  });

  it("全部 null（全白旗）の予測は misreadRate=0", () => {
    const { result } = evaluateRiverTarget(
      ["1z", "9p"].map(parseTileToken),
      river([
        { order: 1, tile: null, riichi: false, tsumogiri: false },
        { order: 2, tile: null, riichi: false, tsumogiri: false },
      ]),
    );
    expect(result.misreadRate).toBe(0);
    expect(result.tileAccuracy).toBe(0);
  });

  it("リーチフラグの取りこぼしは riichiAccuracy に響く", () => {
    const { result } = evaluateRiverTarget(
      expected,
      river([
        { order: 1, tile: "1z", riichi: false, tsumogiri: false },
        { order: 2, tile: "5s", riichi: false, tsumogiri: false }, // 横向き見落とし
        { order: 3, tile: "9p", riichi: false, tsumogiri: false },
      ]),
    );
    expect(result.riichiCorrect).toBe(2);
    expect(result.riichiTotal).toBe(3);
  });
});

describe("evaluateHandTarget（手牌1人分: AI応答 vs 正解）", () => {
  const expectedHand = {
    hand: ["1m", "2m"].map(parseTileToken),
    melds: [
      {
        type: "pon" as const,
        tiles: ["5z", "5z", "5z"].map(parseTileToken),
        from: "left" as const,
      },
    ],
  };
  const predicted = (over: Partial<AiHandResponse>): AiHandResponse => ({
    hand: [{ tile: "1m" }, { tile: "2m" }],
    melds: [
      {
        type: "pon",
        tiles: [{ tile: "5z" }, { tile: "5z" }, { tile: "5z" }],
        from: "left",
      },
    ],
    notes: "",
    ...over,
  });

  it("手牌+鳴き牌の全牌を指標に数える（リーチ指標は対象外）", () => {
    const { result, warnings } = evaluateHandTarget(expectedHand, predicted({}));
    expect(result.tiles).toBe(5);
    expect(result.tileAccuracy).toBe(1);
    expect(result.riichiTotal).toBe(0);
    expect(warnings).toEqual([]);
  });

  it("鳴きの type / from の不一致は警告として報告する（牌指標とは別）", () => {
    const { result, warnings } = evaluateHandTarget(
      expectedHand,
      predicted({
        melds: [
          {
            type: "kan_open",
            tiles: [{ tile: "5z" }, { tile: "5z" }, { tile: "5z" }],
            from: "top",
          },
        ],
      }),
    );
    expect(result.tileAccuracy).toBe(1);
    expect(warnings).toContain("鳴き#1: type 不一致（正解 pon / 予測 kan_open）");
    expect(warnings).toContain("鳴き#1: from 不一致（正解 left / 予測 top）");
  });

  it("鳴きの数が違えば警告し、無い鳴きの牌は誤り扱い", () => {
    const { result, warnings } = evaluateHandTarget(expectedHand, predicted({ melds: [] }));
    expect(result.tiles).toBe(5);
    expect(result.tileCorrect).toBe(2); // 手牌2枚のみ正解
    expect(warnings).toContain("鳴きの数が不一致: 正解 1 / 予測 0");
  });
});
