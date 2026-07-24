import { describe, expect, it } from "vitest";
import { ProblemSchema, PROBLEM_SCHEMA_VERSION, type Problem, type Tile } from "@rigel/schema";
import { canRiichiAfterDiscard, isTenpaiShape, isWinningShape, winningTiles } from "./tenpai";

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
        hand: hand.map((t) => ({ tile: t })),
        melds: melds.map((m) => ({
          type: m.type,
          from: m.type === "kan_closed" ? null : "south",
          tiles: m.tiles.map((t) => ({ tile: t })),
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

describe("winningTiles（3n+1枚の待ち牌列挙）", () => {
  it.each<{ name: string; hand: string; expected: Tile[] }>([
    {
      name: "純正九蓮宝燈は 1m〜9m の9面待ち",
      hand: "1112345678999m",
      expected: ["1m", "2m", "3m", "4m", "5m", "6m", "7m", "8m", "9m"],
    },
    {
      name: "4面子完成の単騎待ちは残った1枚だけが待ち",
      hand: "234m567m789p111s5z",
      expected: ["5z"],
    },
    {
      name: "シャンポン待ちは対子2種の両方が待ち",
      hand: "223344m567p8899s",
      expected: ["8s", "9s"],
    },
    {
      name: "ノベタン 1234m は両端の 1m/4m 待ち",
      hand: "1234m567p789s111z",
      expected: ["1m", "4m"],
    },
    {
      name: "2223456m + 完成形2組は 1m/3m/4m/6m/7m の5面待ち",
      hand: "2223456m789p123s",
      expected: ["1m", "3m", "4m", "6m", "7m"],
    },
    {
      name: "2345678m + 完成形2組は 2m/5m/8m の三面待ち",
      hand: "2345678m111p234s",
      expected: ["2m", "5m", "8m"],
    },
    {
      name: "七対子テンパイは6対子の残り1枚が待ち",
      hand: "1122m3344p5566s7z",
      expected: ["7z"],
    },
    {
      name: "国士無双13面は幺九牌13種すべてが待ち",
      hand: "19m19p19s1234567z",
      expected: ["1m", "9m", "1p", "9p", "1s", "9s", "1z", "2z", "3z", "4z", "5z", "6z", "7z"],
    },
    {
      name: "ノーテン手は待ちなし（空配列）",
      hand: "23m456m789m124p5p9s",
      expected: [],
    },
    {
      name: "枚数が 3n+1 でない手（14枚の和了形）は判定しない（空配列）",
      hand: "123m456m789m123p55p",
      expected: [],
    },
    {
      name: "赤5（0m）の単騎待ちは 5m として列挙する（0m は候補に含めない）",
      hand: "1230m456p789s111z",
      expected: ["5m"],
    },
    {
      name: "赤5（0m）を含む両面 0m6m は 4m/7m 待ち",
      hand: "06m111p222s333z44p",
      expected: ["4m", "7m"],
    },
  ])("$name", ({ hand, expected }) => {
    expect(winningTiles(tiles(hand))).toEqual(expected);
  });

  it("読めない牌（null）を含む手は判定しない（空配列）", () => {
    expect(winningTiles([...tiles("123m456m789m123p"), null])).toEqual([]);
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
