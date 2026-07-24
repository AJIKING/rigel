// 特訓クイズの出題生成（web/mobile 共有）。
// シード付き決定的乱数（mulberry32）＋棄却サンプリングで「解く価値のある手」だけを出題する。
// 採点基盤（winningTiles / bestDiscards）の結果をそのまま正解に使い、採点ロジックを二重実装しない。
// Date.now() / Math.random() は使わない（同一シード→同一問題列の再現が受け入れ条件）。

import { TILE_VALUES, type QuizKind, type Tile } from "@rigel/schema";
import { compareTiles } from "./edit";
import { shanten } from "./shanten";
import { winningTiles } from "./tenpai";
import { discardUkeires } from "./ukeire";

// クイズ種別は背骨（@rigel/schema の QuizKindSchema）に一本化する（重複定義しない）。
export type { QuizKind } from "@rigel/schema";

// ------------------------------------------------------------
// 共有定数・文言（web/mobile の特訓画面と api のサーバ強制で共有。表記ゆれ防止）
// ------------------------------------------------------------

/** 無料プランの特訓クイズ回数上限（1日・JST 0時回復・開始時に1回消費）。有料は無制限。
 *  api がサーバ強制に、web/mobile が文言表示に使う共有値（Plan: docs/plans/quiz-training.md）。 */
export const FREE_QUIZ_PER_DAY = 3;

/** 1セッションの制限秒数（60秒タイムアタック）。 */
export const QUIZ_SESSION_SECONDS = 60;

/** 種目の表示名（種目選択カード・結果画面で共用）。 */
export const QUIZ_KIND_LABELS: Record<QuizKind, string> = {
  chinitsu: "清一色 多面待ち",
  efficiency: "牌効率（受け入れ最大）",
};

/** 種目の説明文（種目選択カードで共用）。 */
export const QUIZ_KIND_DESCRIPTIONS: Record<QuizKind, string> = {
  chinitsu: "単色テンパイ13枚の待ち牌を全部選ぶ。完全一致で正解。",
  efficiency: "14枚から受け入れ枚数が最大になる牌を切る。同率最大はどれでも正解。",
};

/** 無料枠を使い切ったとき（開始 API が 402）の文言。 */
export const QUIZ_LIMIT_MESSAGE = `本日の無料回数（${FREE_QUIZ_PER_DAY}回）を使い切りました。有料プランで無制限に特訓できます。`;

/** 種目選択画面に出す無料枠の注記（残り回数はセッション開始後にしか分からないため静的文言）。 */
export const QUIZ_FREE_NOTE = `無料プランは1日${FREE_QUIZ_PER_DAY}回まで（有料プランは無制限）`;

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

/** 棄却サンプリングの既定試行上限。超えたら Error（フィルタを満たせない設計ミスを黙って隠さない）。 */
export const QUIZ_MAX_GENERATION_ATTEMPTS = 10000;

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
  question: ChinitsuQuestion | EfficiencyQuestion;
  /** あなたの回答（清一色=選んだ待ち牌・選択順 / 牌効率=切った牌1枚）。 */
  picked: Tile[];
  /** 正誤（picked が正解条件を満たしたか）。 */
  ok: boolean;
}

// 牌山（各牌種4枚・赤5なし）。KINDS は tenpai/ukeire の CANDIDATE_TILES と同じ34種。
const KINDS: readonly Tile[] = TILE_VALUES.filter((t) => t[0] !== "0");
const FULL_WALL: readonly Tile[] = KINDS.flatMap((t) => [t, t, t, t]);
const NUMBER_SUITS = ["m", "p", "s"] as const;
const SUIT_WALLS: Record<(typeof NUMBER_SUITS)[number], readonly Tile[]> = {
  m: KINDS.filter((t) => t[1] === "m").flatMap((t) => [t, t, t, t]),
  p: KINDS.filter((t) => t[1] === "p").flatMap((t) => [t, t, t, t]),
  s: KINDS.filter((t) => t[1] === "s").flatMap((t) => [t, t, t, t]),
};

/** 牌山から重複なしで n 枚引く（Fisher–Yates の先頭 n 枚。rng のみ使用で決定的）。 */
function drawTiles(wall: readonly Tile[], n: number, rng: () => number): Tile[] {
  const copy = [...wall];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [copy[i], copy[j]] = [copy[j]!, copy[i]!];
  }
  return copy.slice(0, n);
}

/** 品質フィルタを通るまで再抽選する。上限を超えたら Error（無限ループ防止）。 */
function sampleUntil<T>(attempt: () => T | null, maxAttempts: number): T {
  for (let i = 0; i < maxAttempts; i++) {
    const q = attempt();
    if (q !== null) return q;
  }
  throw new Error(
    `出題生成が試行上限 ${maxAttempts} 回を超えました（品質フィルタを満たす手が引けません）`,
  );
}

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
    const answer = keep.filter((u) => u.count === keep[0]!.count).map((u) => u.discard);
    if (answer.length >= keep.length) return null; // 全打牌が正解では選ぶ意味がない
    return { kind: "efficiency" as const, tiles: tiles.sort(compareTiles), shanten: s, answer };
  }, maxAttempts);
}
