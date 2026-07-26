// 特訓クイズの出題生成が共有する内部ヘルパ（rng 駆動のサンプリング）。
// quiz.ts（清一色/牌効率）と quiz-score-question.ts（点数計算）が共用する。
// index.ts からは export しない（公開面は quiz.ts / quiz-copy.ts / quiz-score-question.ts）。
// Date.now() / Math.random() は使わない（同一シード→同一問題列の再現が受け入れ条件）。

import type { Tile } from "@rigel/schema";

/** 数牌スート（出題生成の色選びで共用）。 */
export const NUMBER_SUITS = ["m", "p", "s"] as const;

/** 棄却サンプリングの既定試行上限。超えたら Error（フィルタを満たせない設計ミスを黙って隠さない）。
 *  公開 API としては quiz.ts が re-export する。 */
export const QUIZ_MAX_GENERATION_ATTEMPTS = 10000;

/** 配列から rng で1要素選ぶ。 */
export function pick<T>(arr: readonly T[], rng: () => number): T {
  return arr[Math.floor(rng() * arr.length)]!;
}

/** 配列を rng で決定的にシャッフルした新配列（Fisher–Yates）。 */
export function shuffled<T>(arr: readonly T[], rng: () => number): T[] {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [copy[i], copy[j]] = [copy[j]!, copy[i]!];
  }
  return copy;
}

/** 牌山から重複なしで n 枚引く（Fisher–Yates の先頭 n 枚。rng のみ使用で決定的）。 */
export function drawTiles(wall: readonly Tile[], n: number, rng: () => number): Tile[] {
  return shuffled(wall, rng).slice(0, n);
}

/** 品質フィルタを通るまで再抽選する。上限を超えたら Error（無限ループ防止）。 */
export function sampleUntil<T>(attempt: () => T | null, maxAttempts: number): T {
  for (let i = 0; i < maxAttempts; i++) {
    const q = attempt();
    if (q !== null) return q;
  }
  throw new Error(
    `出題生成が試行上限 ${maxAttempts} 回を超えました（品質フィルタを満たす手が引けません）`,
  );
}
