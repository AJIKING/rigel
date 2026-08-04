// 特訓クイズの出題生成（web/mobile 共有）。
// シード付き決定的乱数（mulberry32）＋棄却サンプリングで「解く価値のある手」だけを出題する。
// 採点基盤（winningTiles / bestDiscards）の結果をそのまま正解に使い、採点ロジックを二重実装しない。
// Date.now() / Math.random() は使わない（同一シード→同一問題列の再現が受け入れ条件）。
// 2026-07-26 に分割: 文言・共有定数は quiz-copy.ts、点数計算の生成は quiz-score-question.ts、
// サンプリングの内部ヘルパは quiz-random.ts（公開面は index.ts の export * で従来どおり）。

import type {
  QuizAnswerRecord as SchemaQuizAnswerRecord,
  QuizChinitsuQuestion,
  QuizChinitsuUkeireQuestion,
  QuizEfficiencyQuestion,
  QuizKind,
  QuizQuestion as SchemaQuizQuestion,
  QuizSubmittedAnswer,
  Tile,
} from "@rigel/schema";
import { compareTiles } from "./edit";
import { drawTiles, NUMBER_SUITS, QUIZ_MAX_GENERATION_ATTEMPTS, sampleUntil } from "./quiz-random";
import { generateScoreQuestion } from "./quiz-score-question";
import { shanten } from "./shanten";
import { winningTiles } from "./tenpai";
import { CANDIDATE_TILES } from "./tile-counts";
import { bestUkeires, discardUkeires, keepUkeires } from "./ukeire";

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

// 出題・レコードの型は背骨（@rigel/schema の Quiz*QuestionSchema / QuizAnswerRecordSchema）が
// 単一真実源（2026-08-04 移管。サーバのシードリプレイ再採点・有料フル保存が同じ形を使う）。
// ここでは従来名で re-export し、生成器の返り値が背骨の形から逸れたら型エラーで気づけるようにする。
export type ChinitsuQuestion = QuizChinitsuQuestion;
export type EfficiencyQuestion = QuizEfficiencyQuestion;

/**
 * 見直しリストの1件（web/mobile の特訓画面で共有）。セッション中の回答をクライアントに
 * 記録し、結果画面で表示する（回答中は○×のみで正答を見せない・60秒経過時に回答中だった
 * 問題は記録しない。[決定] 2026-07-25 UX変更）。サーバ保存は有料のみ・サーバ再生成の
 * スナップショット（Plan: docs/plans/quiz-open-and-ranking.md Phase 3）。
 */
export type QuizAnswerRecord = SchemaQuizAnswerRecord;

/** 出題エンジンの版数。**生成器（quiz.ts / quiz-score-question.ts / quiz-random.ts /
 *  shanten / ukeire / score-engine）の出力が同一シードで変わる変更をしたら必ず +1 する。**
 *  サーバのシードリプレイ再採点は版数一致を前提にし、不一致のセッションは unverified
 *  （＝ランキング対象外。本人の履歴には残る）として扱う。
 *  v2: 点数計算の条件ラベルを対局表記「東◯局 ◯家 ツモ」へ変更（2026-08-04 オーナー指示）。 */
export const QUIZ_ENGINE_VERSION = 2;

/**
 * 1問の採点（web/mobile の reducer とサーバのシードリプレイ再採点が共有する唯一の物差し）。
 * 清一色=完全一致のみ正解 / 牌効率・清一色 牌効率=切った1枚が answer に含まれれば正解 /
 * 点数計算=choice の文字列一致のみ正解。
 * UI は重複選択を作れないが、サーバリプレイは細工ペイロードを直接受けるので
 * **重複牌でも通らない判定**にする（picked を Set に潰して枚数比較。原則5=サーバの規則で強制）。
 */
export function gradeQuizAnswer(
  question: SchemaQuizQuestion,
  picked: readonly Tile[],
  choice?: string,
): boolean {
  if (question.kind === "score") return choice !== undefined && choice === question.answer;
  if (question.kind === "chinitsu") {
    const answer = new Set<Tile>(question.answer);
    const pickedSet = new Set<Tile>(picked);
    return pickedSet.size === answer.size && [...pickedSet].every((t) => answer.has(t));
  }
  return picked.length === 1 && question.answer.includes(picked[0]!);
}

/** 既定の出題生成（種目→生成器の配線。画面の generateQuestion 注入が無いときと、
 *  サーバのシードリプレイが使う）。**種目を追加したらここに生やす**—— exhaustive switch
 *  なので追加漏れはコンパイルエラーになる（静かに別種目へフォールバックしない）。 */
export function defaultQuizQuestion(kind: QuizKind, rng: () => number): SchemaQuizQuestion {
  switch (kind) {
    case "chinitsu":
      return generateChinitsuQuestion(rng);
    case "chinitsuUkeire":
      return generateChinitsuUkeireQuestion(rng);
    case "efficiency":
      return generateEfficiencyQuestion(rng);
    case "score":
      return generateScoreQuestion(rng);
    default:
      return kind satisfies never;
  }
}

/**
 * サーバのシードリプレイ再採点（チート対策の芯。Plan: docs/plans/quiz-open-and-ranking.md 4-1）。
 * サーバ発行シードから出題列を再生成し、送られた全回答を gradeQuizAnswer で採点し直して
 * 見直しレコード（保存形式=QuizAnswerRecordSchema）を作る。クライアントと同じ生成器・採点器を
 * 使うので、**エンジン版数（QUIZ_ENGINE_VERSION）が一致している前提**でのみ呼ぶこと。
 * 純関数（Workers でもテストでも同じ結果）。
 */
export function replayQuizAnswers(
  kind: QuizKind,
  seed: number,
  answers: readonly QuizSubmittedAnswer[],
): QuizAnswerRecord[] {
  const rng = createQuizRng(seed);
  return answers.map((a) => {
    const question = defaultQuizQuestion(kind, rng);
    return {
      question,
      picked: [...a.picked],
      ...(a.choice === undefined ? {} : { pickedChoice: a.choice }),
      ok: gradeQuizAnswer(question, a.picked, a.choice),
    };
  });
}

// 牌山（各牌種4枚・赤5なし）。牌種34種は counts 基盤（tile-counts.ts）の CANDIDATE_TILES。
const FULL_WALL: readonly Tile[] = CANDIDATE_TILES.flatMap((t) => [t, t, t, t]);
const SUIT_WALLS: Record<(typeof NUMBER_SUITS)[number], readonly Tile[]> = {
  m: CANDIDATE_TILES.filter((t) => t[1] === "m").flatMap((t) => [t, t, t, t]),
  p: CANDIDATE_TILES.filter((t) => t[1] === "p").flatMap((t) => [t, t, t, t]),
  s: CANDIDATE_TILES.filter((t) => t[1] === "s").flatMap((t) => [t, t, t, t]),
};

/**
 * 清一色 何待ち問題を1問生成する。
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

/** 数牌のスート（清一色 牌効率の手牌の色）。 */
export type NumberSuit = (typeof NUMBER_SUITS)[number];

// 型は背骨が単一真実源（suit はこのファイルの NumberSuit と同値）。
export type ChinitsuUkeireQuestion = QuizChinitsuUkeireQuestion;

/** 色ごとの受け入れ候補（9種）。**参照を固定する**: 画面は candidates を useMemo の依存に
 *  渡すので、呼ぶたびに新しい配列を作ると見直しの重い受け入れ計算が毎レンダー走る。 */
const SUIT_CANDIDATES: Record<NumberSuit, readonly Tile[]> = {
  m: CANDIDATE_TILES.filter((t) => t[1] === "m"),
  p: CANDIDATE_TILES.filter((t) => t[1] === "p"),
  s: CANDIDATE_TILES.filter((t) => t[1] === "s"),
};

/** 清一色 牌効率で受け入れとして数える牌種（その色の9種）。出題と見直しが同じ物差しを使う。 */
export function chinitsuUkeireCandidates(suit: NumberSuit): readonly Tile[] {
  return SUIT_CANDIDATES[suit];
}

/** 清一色 何待ちの回答候補（出題スートの 1〜9）。web/mobile の出題画面が共有する
 *  （画面ごとの手組みを排して物差しを1つに）。 */
export function chinitsuWaitCandidates(question: QuizChinitsuQuestion): readonly Tile[] {
  return SUIT_CANDIDATES[question.tiles[0]![1] as NumberSuit];
}

/** テンパイ問題で要求する「テンパイを保つ打牌」の下限（[決定] 2026-07-26。
 *  少ないと総当たりで解けてしまい、上級者向けの難度にならない）。 */
const CHINITSU_UKEIRE_MIN_TENPAI_DISCARDS = 4;

/**
 * 清一色 牌効率問題を1問生成する（Plan: docs/plans/quiz-chinitsu-ukeire.md）。
 *
 * フィルタ: 1問ごとに「テンパイ / 1向聴」を 1/2 で選び、その向聴の単色14枚を引く
 * （単色14枚に2向聴は存在しないため、この2つが全て）。正解は**最小向聴を保つ打牌**
 * （＝向聴戻しもテンパイ崩しもしない）のうち広さ最大で、同率は全部。
 * 全打牌が正解になる手は選ぶ意味がないので捨てる。テンパイ問題はさらに打牌候補の下限を課す。
 */
export function generateChinitsuUkeireQuestion(
  rng: () => number,
  maxAttempts = QUIZ_MAX_GENERATION_ATTEMPTS,
): ChinitsuUkeireQuestion {
  const target = rng() < 0.5 ? 0 : 1;
  const minDiscards = target === 0 ? CHINITSU_UKEIRE_MIN_TENPAI_DISCARDS : 2;
  return sampleUntil(() => {
    const suit = NUMBER_SUITS[Math.floor(rng() * NUMBER_SUITS.length)]!;
    const tiles = drawTiles(SUIT_WALLS[suit], 14, rng);
    if (shanten(tiles) !== target) return null;
    // 最小向聴を保つ打牌だけを評価する（向聴戻しは正解になり得ず、単色手では
    // 全14打牌ぶんの受け入れ計算が重い）。受け入れは同色9種のみ数える。
    const keep = keepUkeires(tiles, 0, chinitsuUkeireCandidates(suit));
    if (keep.length < minDiscards) return null;
    const answer = bestUkeires(keep).map((u) => u.discard);
    if (answer.length >= keep.length) return null; // 全打牌が正解では選ぶ意味がない
    return {
      kind: "chinitsuUkeire" as const,
      tiles: tiles.sort(compareTiles),
      suit,
      shanten: target,
      answer,
    };
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
