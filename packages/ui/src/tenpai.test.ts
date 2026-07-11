import { describe, expect, it } from "vitest";
import { ProblemSchema, PROBLEM_SCHEMA_VERSION, type Problem, type Tile } from "@rigel/schema";
import { canRiichiAfterDiscard, isTenpaiShape, isWinningShape } from "./tenpai";

/** "123m45p7z" 形式を Tile 配列に展開する（テスト記述用）。 */
function tiles(spec: string): Tile[] {
  const out: Tile[] = [];
  let digits = "";
  for (const ch of spec) {
    if (ch >= "0" && ch <= "9") digits += ch;
    else {
      for (const d of digits) out.push(`${d}${ch}` as Tile);
      digits = "";
    }
  }
  return out;
}

function problem(
  hand: Tile[],
  drawn: Tile,
  melds: { type: "pon" | "kan_closed"; tiles: Tile[] }[] = [],
): Problem {
  return ProblemSchema.parse({
    schemaVersion: PROBLEM_SCHEMA_VERSION,
    kind: "discard",
    pov: "east",
    drawn,
    seats: {
      east: {
        hand: hand.map((t) => ({ tile: t, confidence: 1 })),
        melds: melds.map((m) => ({
          type: m.type,
          from: m.type === "kan_closed" ? null : "south",
          tiles: m.tiles.map((t) => ({ tile: t, confidence: 1 })),
        })),
      },
      south: {},
      west: {},
      north: {},
    },
  });
}

describe("isWinningShape（門前部分の和了形判定）", () => {
  it("4面子1雀頭を和了形と判定する", () => {
    expect(isWinningShape(tiles("123m456m789m123p55p"))).toBe(true);
  });

  it("面子が完成しない14枚は和了形でない", () => {
    expect(isWinningShape(tiles("123m456m789m124p55p"))).toBe(false);
  });

  it("七対子を和了形と判定する（同種4枚の2組は不成立）", () => {
    expect(isWinningShape(tiles("11m22m33p44p55s66s77z"))).toBe(true);
    expect(isWinningShape(tiles("1111m2222m33p44p55s"))).toBe(false);
  });

  it("国士無双を和了形と判定する", () => {
    expect(isWinningShape(tiles("19m19p19s1234567z1z"))).toBe(true);
  });

  it("赤5は通常の5として数える（0m=5m）", () => {
    expect(isWinningShape(tiles("340m456p789s11z22z2z"))).toBe(true); // 345m(赤)+456p+789s+11z+222z
  });

  it("副露があるぶん短い門前部分（3n+2枚）も判定できる", () => {
    expect(isWinningShape(tiles("123m456p55s"))).toBe(true); // 2面子1雀頭（残り2面子は副露想定）
  });
});

describe("isTenpaiShape（3n+1枚がテンパイか）", () => {
  it("タンキ待ちをテンパイと判定する", () => {
    expect(isTenpaiShape(tiles("123m456m789m123p4p"))).toBe(true);
  });

  it("シャンポン待ちをテンパイと判定する", () => {
    expect(isTenpaiShape(tiles("123m456p789s11z22z"))).toBe(true);
  });

  it("1シャンテンはテンパイでない", () => {
    expect(isTenpaiShape(tiles("23m456m789m124p5p9s"))).toBe(false);
  });

  it("七対子・国士のテンパイも拾う", () => {
    expect(isTenpaiShape(tiles("11m22m33p44p55s66s7z"))).toBe(true); // 七対子タンキ
    expect(isTenpaiShape(tiles("19m19p19s1234567z"))).toBe(true); // 国士13面
  });

  it("読めない牌（null）を含む場合は false", () => {
    expect(isTenpaiShape([...tiles("123m456m789m123p"), null] as unknown as Tile[])).toBe(false);
  });
});

describe("canRiichiAfterDiscard（何切る: 選んだ牌を切ってリーチできるか）", () => {
  // 手牌 123456789m123p4p ＋ ツモ 5p。5p ツモ切り or 4p 手出しでテンパイ維持。
  const HAND = tiles("123456789m1234p");

  it("テンパイを維持する打牌ならリーチできる", () => {
    expect(canRiichiAfterDiscard(problem(HAND, "5p"), { tile: "5p", drawn: true })).toBe(true);
    expect(canRiichiAfterDiscard(problem(HAND, "5p"), { tile: "4p", drawn: false })).toBe(true);
  });

  it("ノーテンになる打牌ではリーチできない", () => {
    expect(canRiichiAfterDiscard(problem(HAND, "5p"), { tile: "1m", drawn: false })).toBe(false);
  });

  it("切る牌が未選択（null）ならリーチできない", () => {
    expect(canRiichiAfterDiscard(problem(HAND, "5p"), null)).toBe(false);
  });

  it("副露がある（門前でない）とリーチできない", () => {
    const p = problem(tiles("1234567m123p"), "5p", [{ type: "pon", tiles: tiles("111z") }]);
    expect(canRiichiAfterDiscard(p, { tile: "5p", drawn: true })).toBe(false);
  });

  it("暗槓は門前扱い（テンパイならリーチできる）", () => {
    // 手牌 123m456m789m1p ＋ 暗槓 1111z ＋ ツモ 5z。5z ツモ切りで 1p タンキ。
    const p = problem(tiles("123m456m789m1p"), "5z", [
      { type: "kan_closed", tiles: tiles("1111z") },
    ]);
    expect(canRiichiAfterDiscard(p, { tile: "5z", drawn: true })).toBe(true);
    expect(canRiichiAfterDiscard(p, { tile: "9m", drawn: false })).toBe(false); // 9m 切りはノーテン
  });
});
