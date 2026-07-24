import { describe, expect, it } from "vitest";
import { TILE_VALUES, type Tile } from "@rigel/schema";
import { createQuizRng } from "./quiz";
import { shanten } from "./shanten";
import { winningTiles } from "./tenpai";

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

describe("shanten（和了形 14 枚は -1）", () => {
  it.each<{ name: string; hand: string; expected: number }>([
    { name: "通常形（4面子1雀頭）は -1", hand: "123m456m789m123p55p", expected: -1 },
    { name: "七対子は -1", hand: "11m22m33p44p55s66s77z", expected: -1 },
    { name: "国士無双は -1", hand: "19m19p19s1234567z1z", expected: -1 },
  ])("$name", ({ hand, expected }) => {
    expect(shanten(tiles(hand))).toBe(expected);
  });
});

describe("shanten（テンパイ 13 枚は 0）", () => {
  it.each<{ name: string; hand: string; expected: number }>([
    { name: "通常形のノベタン（1p/4p 待ち）は 0", hand: "123456789m1234p", expected: 0 },
    { name: "七対子タンキは 0", hand: "11m22m33p44p55s66s7z", expected: 0 },
    { name: "国士13面待ちは 0", hand: "19m19p19s1234567z", expected: 0 },
  ])("$name", ({ hand, expected }) => {
    expect(shanten(tiles(hand))).toBe(expected);
  });
});

describe("shanten（既知手の向聴数）", () => {
  // 期待値は手分解で検算済み。通常形は 8 - 2*(副露+面子) - 搭子 - 雀頭 の最小値
  // （ブロックは 面子+搭子 ≤ 4-副露 に制限）。
  it.each<{ name: string; hand: string; expected: number }>([
    {
      // 3面子 + 雀頭55s。14p は搭子でない（間が2つ空き）→ 8-6-0-1 = 1
      name: "3面子+雀頭+孤立牌の1向聴",
      hand: "123m456m789m14p55s",
      expected: 1,
    },
    {
      // 2面子(123m,456m) + 搭子78m + 雀頭55s → 8-4-1-1 = 2
      name: "2面子+搭子1+雀頭の2向聴",
      hand: "123m456m78m14p55s9s",
      expected: 2,
    },
    {
      // 面子0・搭子4(45m,68m,34p,79s)・雀頭11z → 8-0-4-1 = 3
      name: "搭子4+雀頭の3向聴（通常形が最小）",
      hand: "245m68m134p79s112z",
      expected: 3,
    },
    {
      // 通常形: 雀頭22m+対子搭子2 → 5 / 国士: 1z-7z の7種・対子なし → 6
      // 七対子: 対子3・種類10 → 6-3+0 = 3 が最小
      name: "字牌バラバラ手は七対子（3対子）の3向聴が通常形(5)より小さい",
      hand: "22m55p66s1234567z",
      expected: 3,
    },
    {
      // 国士: 幺九11種・対子なし → 13-11-0 = 2 / 通常形: 搭子2(12m,13p)のみ → 6
      // 七対子: 対子0・種類13 → 6 。国士の 2 が最小
      name: "幺九バラバラ手は国士(2向聴)が通常形(6)より小さい",
      hand: "129m139p19s12345z",
      expected: 2,
    },
    {
      // 通常形: 面子0・搭子4(24m,68m,24p,68p)・雀頭なし → 8-0-4-0 = 4
      name: "カンチャン4つ・雀頭なしの4向聴",
      hand: "24m68m24p68p24s2z5z7z",
      expected: 4,
    },
    {
      // 通常形: 搭子3(24m,68m,24p)・雀頭なし → 8-0-3-0 = 5（七対子6・国士7より小さい）
      name: "搭子3・雀頭なしの5向聴",
      hand: "24m68m24p159s2457z",
      expected: 5,
    },
    {
      // 通常形: 面子0・搭子0・雀頭なし → 8 だが、七対子 6-0+max(0,7-13) = 6 が最小
      name: "完全バラバラの配牌級は七対子の6向聴（向聴数の最大値）",
      hand: "147m258p369s1234z",
      expected: 6,
    },
  ])("$name", ({ hand, expected }) => {
    expect(shanten(tiles(hand))).toBe(expected);
  });
});

describe("shanten（副露あり: meldCount で部分手を評価）", () => {
  it.each<{ name: string; hand: string; meldCount: number; expected: number }>([
    {
      name: "副露1・10枚の単騎テンパイは 0",
      hand: "123m456m789m5z",
      meldCount: 1,
      expected: 0,
    },
    {
      name: "副露2・7枚（1面子+搭子+雀頭）のテンパイは 0",
      hand: "123m45m66p",
      meldCount: 2,
      expected: 0,
    },
    {
      // 国士を誤って適用すると 13-10-0 = 3 になる手。副露ありは通常形のみ → 8-2 = 6
      name: "副露ありの手に国士は適用しない（幺九10種でも 6）",
      hand: "19m19p19s1234z",
      meldCount: 1,
      expected: 6,
    },
    {
      // 副露ありは七対子も適用しない（対子5個でも通常形 8-2-3-1 = 2 で評価）
      name: "副露ありの手に七対子は適用しない（対子5個は通常形の 2）",
      hand: "11m22m33p44p55s",
      meldCount: 1,
      expected: 2,
    },
  ])("$name", ({ hand, meldCount, expected }) => {
    expect(shanten(tiles(hand), meldCount)).toBe(expected);
  });
});

describe("shanten（赤5は通常の5と同一視）", () => {
  it("赤5タンキ（1230m…）のテンパイは 0", () => {
    expect(shanten(tiles("1230m456p789s111z"))).toBe(0);
  });

  it("赤5入りの和了形（340m…）は -1", () => {
    expect(shanten(tiles("340m456p789s11z22z2z"))).toBe(-1);
  });
});

describe("shanten（判定できない枚数は Infinity）", () => {
  it.each<{ name: string; hand: string; meldCount?: number }>([
    { name: "3枚（副露換算しても13/14にならない）", hand: "123m" },
    { name: "15枚", hand: "123m456m789m123p556p" },
    { name: "0枚", hand: "" },
    { name: "13枚 + meldCount=1（合計16枚相当の不整合）", hand: "123456789m1234p", meldCount: 1 },
  ])("$name は Infinity", ({ hand, meldCount }) => {
    expect(shanten(tiles(hand), meldCount)).toBe(Infinity);
  });
});

// ------------------------------------------------------------
// 性質テスト: 13枚の手で「shanten === 0 ⇔ winningTiles が非空」
// （既存のテンパイ判定と機械的に整合させる。シード固定で決定的）
// ------------------------------------------------------------

// シード固定の乱数は quiz.ts の createQuizRng（mulberry32）に一元化した。

/** pool から重複なしで n 枚引く（Fisher–Yates の先頭 n 枚）。 */
function draw(pool: readonly Tile[], n: number, rand: () => number): Tile[] {
  const wall = [...pool];
  for (let i = wall.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [wall[i], wall[j]] = [wall[j]!, wall[i]!];
  }
  return wall.slice(0, n);
}

describe("shanten と winningTiles の整合（性質テスト・シード固定100手）", () => {
  const KINDS: readonly Tile[] = TILE_VALUES.filter((t) => t[0] !== "0"); // 34種（赤抜き）
  const FULL_WALL: readonly Tile[] = KINDS.flatMap((t) => [t, t, t, t]);
  // テンパイが現実的な頻度で出るよう、後半は索子+東に絞った牌山から引く。
  const BIASED_WALL: readonly Tile[] = KINDS.filter((t) => t[1] === "s" || t === "1z").flatMap(
    (t) => [t, t, t, t],
  );

  it("13枚の手で shanten==0 と 待ちが存在する が一致する", () => {
    const rand = createQuizRng(20260725);
    const hands: Tile[][] = [];
    for (let i = 0; i < 50; i++) hands.push(draw(FULL_WALL, 13, rand));
    for (let i = 0; i < 50; i++) hands.push(draw(BIASED_WALL, 13, rand));

    const mismatches: { hand: string; shanten: number; waits: Tile[] }[] = [];
    let tenpaiCount = 0;
    for (const hand of hands) {
      const s = shanten(hand);
      const waits = winningTiles(hand);
      // 13枚は和了形になり得ず、七対子の上限より悪くはならない。
      expect(s).toBeGreaterThanOrEqual(0);
      expect(s).toBeLessThanOrEqual(6);
      if (waits.length > 0) tenpaiCount++;
      if ((s === 0) !== waits.length > 0) {
        mismatches.push({ hand: hand.join(""), shanten: s, waits });
      }
    }
    expect(mismatches).toEqual([]);
    // テンパイ手が1件も出ないと性質テストが空振りになるので、出ていることも固定する。
    expect(tenpaiCount).toBeGreaterThan(0);
  });
});
