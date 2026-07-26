// 向聴数計算（特訓クイズの出題フィルタ・受け入れ計算の基盤。web/mobile 共有）。
// tenpai.ts と同じ counts 基盤（tile-counts.ts。34種・赤5正規化）を土台に、
// 通常形・七対子・国士の最小値を返す。

import type { Tile } from "@rigel/schema";
import { KOKUSHI, toCounts } from "./tile-counts";

/**
 * 通常形の向聴数: 8 - 2*(副露+面子) - 搭子 - 雀頭(0/1) の最小値。
 * 雀頭候補（各対子＋雀頭なし）を外側で全通り試し、残りから面子・搭子を
 * バックトラックで最大化する。ブロック数は 面子+搭子 ≤ 4-副露 に制限
 * （余った搭子は和了に寄与しない）。字牌は順子を作らない（tenpai.ts と同じ規約）。
 */
function normalShanten(c: number[], meldCount: number): number {
  const maxBlocks = 4 - meldCount;
  let best = Infinity;

  const walk = (i: number, sets: number, partials: number, hasHead: boolean): void => {
    while (i < 34 && c[i] === 0) i++;
    if (i === 34) {
      const s = 8 - 2 * (meldCount + sets) - partials - (hasHead ? 1 : 0);
      if (s < best) best = s;
      return;
    }
    if (sets + partials < maxBlocks) {
      // 刻子
      if (c[i] >= 3) {
        c[i] -= 3;
        walk(i, sets + 1, partials, hasHead);
        c[i] += 3;
      }
      // 順子（数牌のみ。スート境界 8,9 からは作れない）
      if (i < 27 && i % 9 <= 6 && c[i + 1] > 0 && c[i + 2] > 0) {
        c[i]--;
        c[i + 1]--;
        c[i + 2]--;
        walk(i, sets + 1, partials, hasHead);
        c[i]++;
        c[i + 1]++;
        c[i + 2]++;
      }
      // 対子搭子（刻子待ち）
      if (c[i] >= 2) {
        c[i] -= 2;
        walk(i, sets, partials + 1, hasHead);
        c[i] += 2;
      }
      // 両面・辺張搭子
      if (i < 27 && i % 9 <= 7 && c[i + 1] > 0) {
        c[i]--;
        c[i + 1]--;
        walk(i, sets, partials + 1, hasHead);
        c[i]++;
        c[i + 1]++;
      }
      // 嵌張搭子
      if (i < 27 && i % 9 <= 6 && c[i + 2] > 0) {
        c[i]--;
        c[i + 2]--;
        walk(i, sets, partials + 1, hasHead);
        c[i]++;
        c[i + 2]++;
      }
    }
    // この牌を浮き牌にする
    c[i]--;
    walk(i, sets, partials, hasHead);
    c[i]++;
  };

  // 雀頭なし
  walk(0, 0, 0, false);
  // 各対子を雀頭に取る
  for (let p = 0; p < 34; p++) {
    if (c[p] < 2) continue;
    c[p] -= 2;
    walk(0, 0, 0, true);
    c[p] += 2;
  }
  return best;
}

/** 七対子の向聴数: 6 - 対子数 + max(0, 7 - 種類数)。同種3枚以上も対子1つと数える。 */
function chiitoiShanten(c: number[]): number {
  let pairs = 0;
  let kinds = 0;
  for (const n of c) {
    if (n > 0) kinds++;
    if (n >= 2) pairs++;
  }
  return 6 - pairs + Math.max(0, 7 - kinds);
}

/** 国士無双の向聴数: 13 - 幺九種類数 - (幺九対子があれば1)。 */
function kokushiShanten(c: number[]): number {
  let kinds = 0;
  let hasPair = false;
  for (const i of KOKUSHI) {
    if (c[i] > 0) kinds++;
    if (c[i] >= 2) hasPair = true;
  }
  return 13 - kinds - (hasPair ? 1 : 0);
}

/**
 * 手牌の向聴数（テンパイ=0・和了形=-1）。通常形・七対子・国士の最小値。
 * 副露がある手は「手牌 13 - 3×副露数」の部分手として meldCount（省略時 0）で評価する。
 * 七対子・国士は門前13/14枚のときのみ考慮する（副露があると成立しない）。
 * 手牌枚数 + 3×meldCount が 13/14 にならない手は判定できないので Infinity を返す
 * （判定不能の手を最良扱いしない）。赤5（0x）は 5 と同一視する。
 */
export function shanten(tiles: readonly Tile[], meldCount = 0): number {
  if (!Number.isInteger(meldCount) || meldCount < 0) return Infinity;
  const total = tiles.length + meldCount * 3;
  if (total !== 13 && total !== 14) return Infinity;
  const c = toCounts(tiles);
  let best = normalShanten(c, meldCount);
  if (meldCount === 0) {
    best = Math.min(best, chiitoiShanten(c), kokushiShanten(c));
  }
  return best;
}
