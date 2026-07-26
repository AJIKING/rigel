// 特訓クイズの出題生成（web/mobile 共有）。
// シード付き決定的乱数（mulberry32）＋棄却サンプリングで「解く価値のある手」だけを出題する。
// 採点基盤（winningTiles / bestDiscards）の結果をそのまま正解に使い、採点ロジックを二重実装しない。
// Date.now() / Math.random() は使わない（同一シード→同一問題列の再現が受け入れ条件）。
// 2026-07-26 に分割: 文言・共有定数は quiz-copy.ts、点数計算の生成は quiz-score-question.ts、
// サンプリングの内部ヘルパは quiz-random.ts（公開面は index.ts の export * で従来どおり）。

import type { Tile } from "@rigel/schema";
import { compareTiles } from "./edit";
import { drawTiles, NUMBER_SUITS, QUIZ_MAX_GENERATION_ATTEMPTS, sampleUntil } from "./quiz-random";
import type { ScoreQuestion } from "./quiz-score-question";
import { shanten } from "./shanten";
import { winningTiles } from "./tenpai";
import { CANDIDATE_TILES } from "./tile-counts";
import { bestUkeires, discardUkeires } from "./ukeire";

// クイズ種別は背骨（@rigel/schema の QuizKindSchema）に一本化する（重複定義しない）。
export type { QuizKind } from "@rigel/schema";

// 棄却サンプリングの既定試行上限（内部実装は quiz-random.ts。公開面は従来どおりここから）。
export { QUIZ_MAX_GENERATION_ATTEMPTS } from "./quiz-random";

/** シード付き決定的乱数（mulberry32・0以上1未満）。同じ seed から同じ問題列が再現される。 */
export function createQuizRng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface ChinitsuQuestion {
  kind: "chinitsu";
  /** 単色テンパイ13枚（理牌済み・昇順）。 */
  tiles: Tile[];
  /** 正解 = 待ち牌（2種以上・TILE_VALUES 順）。 */
  answer: Tile[];
}

export interface EfficiencyQuestion {
  kind: "efficiency";
  /** 14枚（理牌済み。字牌あり得る・赤5は出題に含めない）。 */
  tiles: Tile[];
  /** 出題時点の向聴数（1 か 2）。 */
  shanten: number;
  /** 正解 = 最小向聴を保ちつつ受け入れ枚数最大の打牌（同率全部）。 */
  answer: Tile[];
}

/**
 * 見直しリストの1件（web/mobile の特訓画面で共有）。セッション中の回答をクライアントに
 * 記録し、結果画面でのみ表示する（サーバへは送らない。回答中は○×のみで正答を見せない・
 * 60秒経過時に回答中だった問題は記録しない。[決定] 2026-07-25 UX変更）。
 */
export interface QuizAnswerRecord {
  /** 出題（tiles=手牌 / answer=正解）。 */
  question: ChinitsuQuestion | EfficiencyQuestion | ScoreQuestion;
  /** あなたの回答（清一色=選んだ待ち牌・選択順 / 牌効率=切った牌1枚 / 点数計算=空配列）。 */
  picked: Tile[];
  /** 点数計算の選んだ選択肢（他種目は undefined）。 */
  pickedChoice?: string;
  /** 正誤（picked が正解条件を満たしたか）。 */
  ok: boolean;
}

// 牌山（各牌種4枚・赤5なし）。牌種34種は counts 基盤（tile-counts.ts）の CANDIDATE_TILES。
const FULL_WALL: readonly Tile[] = CANDIDATE_TILES.flatMap((t) => [t, t, t, t]);
const SUIT_WALLS: Record<(typeof NUMBER_SUITS)[number], readonly Tile[]> = {
  m: CANDIDATE_TILES.filter((t) => t[1] === "m").flatMap((t) => [t, t, t, t]),
  p: CANDIDATE_TILES.filter((t) => t[1] === "p").flatMap((t) => [t, t, t, t]),
  s: CANDIDATE_TILES.filter((t) => t[1] === "s").flatMap((t) => [t, t, t, t]),
};

/**
 * 清一色多面待ち問題を1問生成する。
 * フィルタ: 萬/筒/索からランダムに1色 → その色のみ13枚 → テンパイかつ待ち2種以上。
 */
export function generateChinitsuQuestion(
  rng: () => number,
  maxAttempts = QUIZ_MAX_GENERATION_ATTEMPTS,
): ChinitsuQuestion {
  return sampleUntil(() => {
    const suit = NUMBER_SUITS[Math.floor(rng() * NUMBER_SUITS.length)]!;
    const tiles = drawTiles(SUIT_WALLS[suit], 13, rng);
    if (shanten(tiles) !== 0) return null;
    const answer = winningTiles(tiles);
    if (answer.length < 2) return null;
    return { kind: "chinitsu" as const, tiles: tiles.sort(compareTiles), answer };
  }, maxAttempts);
}

/**
 * 牌効率問題を1問生成する。
 * フィルタ: 14枚（字牌込み）→ 向聴数が 1 か 2 → 差の付く手
 * （最小向聴を保つ打牌が2種以上あり、かつ正解=受け入れ最大がその全部ではない）。
 */
export function generateEfficiencyQuestion(
  rng: () => number,
  maxAttempts = QUIZ_MAX_GENERATION_ATTEMPTS,
): EfficiencyQuestion {
  return sampleUntil(() => {
    const tiles = drawTiles(FULL_WALL, 14, rng);
    const s = shanten(tiles);
    if (s !== 1 && s !== 2) return null;
    // discardUkeires は「向聴が小さい順→count が大きい順」なので先頭が最小向聴・最大受け入れ。
    const all = discardUkeires(tiles);
    const keep = all.filter((u) => u.shanten === all[0]!.shanten);
    if (keep.length < 2) return null;
    // 正解集合の判定は bestUkeires（ukeire.ts）に一元化（結果画面の受け入れ詳細と同一ルール）。
    const answer = bestUkeires(all).map((u) => u.discard);
    if (answer.length >= keep.length) return null; // 全打牌が正解では選ぶ意味がない
    return { kind: "efficiency" as const, tiles: tiles.sort(compareTiles), shanten: s, answer };
  }, maxAttempts);
}
