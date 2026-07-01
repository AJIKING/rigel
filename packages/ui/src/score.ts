// 打点計算（和了の han/fu と半荘ルールから支払いを求める純粋関数）。
// アプリが計算する範囲は「基本点→支払い」まで。役の判定は人が入力する（自動判定はしない）。
// 参照: 一般的な麻雀の点数計算（基本点 = 符 × 2^(2+飜)、満貫以上は固定、100点単位で切り上げ）。

import type { Rules } from "@rigel/schema";

export interface HandScoreInput {
  /** 飜数（赤ドラ・ドラ込みの合計。役の判定はしない）。 */
  han: number;
  /** 符。満貫以上（han>=5）では無視される。 */
  fu: number;
  /** 和了者が親か。 */
  dealer: boolean;
  /** ツモ和了か（false=ロン）。 */
  tsumo: boolean;
}

/** 支払い内訳。ロン=放銃者1人、親ツモ=全員同額、子ツモ=親/子で異なる。 */
export type Payment =
  { ron: number } | { each: number } | { fromDealer: number; fromNonDealer: number };

export interface HandScore {
  /** 基本点（満貫以上は固定値）。 */
  base: number;
  /** 打点合計（本場・供託を除く）。 */
  total: number;
  /** 満貫以上のランク名（満貫/跳満/倍満/三倍満/役満）。無ければ null。 */
  limit: string | null;
  payment: Payment;
}

const roundUp100 = (n: number): number => Math.ceil(n / 100) * 100;

/** 飜（と符・ルール）から基本点と満貫以上のランク名を求める。 */
function basePoints(han: number, fu: number, rules: Rules): { base: number; limit: string | null } {
  if (han >= 13)
    return rules.kazoe ? { base: 8000, limit: "役満" } : { base: 6000, limit: "三倍満" };
  if (han >= 11) return { base: 6000, limit: "三倍満" };
  if (han >= 8) return { base: 4000, limit: "倍満" };
  if (han >= 6) return { base: 3000, limit: "跳満" };
  if (han >= 5) return { base: 2000, limit: "満貫" };
  // 切り上げ満貫（4飜30符・3飜60符を満貫に）。
  if (rules.kiriage && ((han === 4 && fu === 30) || (han === 3 && fu === 60))) {
    return { base: 2000, limit: "満貫" };
  }
  const base = fu * 2 ** (2 + han);
  // 3飜70符・4飜40符以上は満貫に切り詰める。
  if (base >= 2000) return { base: 2000, limit: "満貫" };
  return { base, limit: null };
}

/** 和了1件の打点を計算する。 */
export function handScore(input: HandScoreInput, rules: Rules): HandScore {
  const { han, fu, dealer, tsumo } = input;
  const { base, limit } = basePoints(han, fu, rules);

  if (!tsumo) {
    // ロン: 親=基本点×6、子=×4。
    const ron = roundUp100(base * (dealer ? 6 : 4));
    return { base, total: ron, limit, payment: { ron } };
  }

  if (dealer) {
    // 親ツモ: 全員が 基本点×2。
    const each = roundUp100(base * 2);
    return { base, total: each * 3, limit, payment: { each } };
  }

  // 子ツモ: 親は 基本点×2、子は 基本点×1。
  const fromDealer = roundUp100(base * 2);
  const fromNonDealer = roundUp100(base);
  return {
    base,
    total: fromDealer + fromNonDealer * 2,
    limit,
    payment: { fromDealer, fromNonDealer },
  };
}
