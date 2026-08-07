// ============================================================
// 特訓ランキング（web/mobile/api 共有の純ロジック）
// ------------------------------------------------------------
// [決定] 2026-08-04 オーナー: ランキングは強制表示（表示は常時公開のプロフィール情報
// = displayName/handle のみ。userId は返さない）・チート対策必須（対象は verified
// セッションのみ）・期間は 週間/月間/全期間。
// [決定] 2026-08-07 オーナー: 「正解数」「正答率」の2ボードを廃止し、
// **スコア = 正解数 × 正答率（= correct² / total）** の単一ボードに統合。
// 量（正答数）と質（正答率）の両方が効くため、旧・正答率ボードの最低解答数しきい値
// （50問未満除外）は不要になり撤廃（少プレイはスコアが自然に低い）。
// wire 型（QuizRankingRow/Entry/Me・期間 enum）は背骨（@rigel/schema）が単一真実源で、
// ここは並び・スコア定義・上位打ち切り・自分の順位・表示文言を一元化する。
// Plan: docs/plans/quiz-open-and-ranking.md 4-2
// ============================================================

import {
  QuizRankingPeriodSchema,
  type QuizRankingEntry,
  type QuizRankingMe,
  type QuizRankingPeriod,
  type QuizRankingRow,
} from "@rigel/schema";

// 従来名での参照を維持（型の実体は背骨。二重定義しない）。
export type { QuizRankingEntry, QuizRankingMe, QuizRankingPeriod, QuizRankingRow };

/** 期間チップの並びとラベル（key は背骨 QuizRankingPeriodSchema.options から導出。
 *  週間=JST 月曜起点・月間=JST 月初起点＝@rigel/schema の jstStartOfWeek / jstStartOfMonth）。 */
export const QUIZ_RANKING_PERIODS: readonly { key: QuizRankingPeriod; label: string }[] =
  QuizRankingPeriodSchema.options.map((key) => ({
    key,
    label: key === "weekly" ? "週間" : key === "monthly" ? "月間" : "全期間",
  }));

/** 上位の表示件数（実装既定値。自分の順位は全体から計算するので圏外でも出せる）。 */
export const QUIZ_RANKING_TOP_N = 50;

// ---- 表示文言（web/mobile で共有。表記ゆれ防止） ----

/** ボードの空状態。 */
export const QUIZ_RANKING_EMPTY_MESSAGE = "まだ記録がありません";

/** ボードのラベル（web は aria-label と自分の順位行・mobile はカードのタイトルで使用。
 *  web の見出し表示は 2026-08-08 に廃止。ベタ書きに戻すと web/mobile のドリフトを
 *  機械検査できないので定数で共有する）。 */
export const QUIZ_RANKING_BOARD_LABEL = "スコア";

/** displayName も handle も空のときの表示名フォールバック。 */
export const QUIZ_RANKING_NAME_FALLBACK = "プレイヤー";

/** ランキングへの導線ラベル（特訓の種目選択・結果画面・マイページで共用）。 */
export const QUIZ_RANKING_LINK_LABEL = "ランキングを見る";

/** 表示名の解決規則（displayName → handle → フォールバック）。web/mobile が同じ規則を使う
 *  （片方だけ変えて表示が割れないように、規則ごと共有する）。 */
export function quizRankingName(e: Pick<QuizRankingEntry, "displayName" | "handle">): string {
  return e.displayName || e.handle || QUIZ_RANKING_NAME_FALLBACK;
}

function accuracyOf(r: { correct: number; total: number }): number {
  return r.total > 0 ? r.correct / r.total : 0;
}

/** スコア = 正答数 × 正答率（= correct² / total。total=0 は 0）。 */
export function quizScoreOf(r: { correct: number; total: number }): number {
  return r.total > 0 ? (r.correct * r.correct) / r.total : 0;
}

/** スコアの表示（小数1桁固定。桁が揺れて順位表が読みにくくならないように）。 */
export function quizScoreLabel(score: number): string {
  return score.toFixed(1);
}

/** 1224式の順位列を作る（同点は同順位を共有・次は人数ぶん飛ぶ。[決定] 2026-08-04 オーナー）。
 *  sorted は降順ソート済み・tie は「順位の物差しとして等しいか」（表示順の安定化キーは含めない）。 */
function competitionRanks(
  sorted: readonly QuizRankingRow[],
  tie: (a: QuizRankingRow, b: QuizRankingRow) => boolean,
): number[] {
  const ranks: number[] = [];
  for (let i = 0; i < sorted.length; i++) {
    ranks.push(i > 0 && tie(sorted[i]!, sorted[i - 1]!) ? ranks[i - 1]! : i + 1);
  }
  return ranks;
}

/** スコアの同点判定。分数（correct²/total）として厳密比較する（浮動小数の丸め誤差で
 *  同点が別順位に割れないように交差積で判定）。全期間の累積は無上限で correct²×total が
 *  2^53 を超え得るため、BigInt で比較する（判定は隣接行のみ＝コストは軽微）。 */
const scoreTie = (a: QuizRankingRow, b: QuizRankingRow) =>
  BigInt(a.correct) * BigInt(a.correct) * BigInt(b.total) ===
  BigInt(b.correct) * BigInt(b.correct) * BigInt(a.total);

function toEntry(r: QuizRankingRow, rank: number): QuizRankingEntry {
  return {
    rank,
    handle: r.handle,
    displayName: r.displayName,
    correct: r.correct,
    total: r.total,
    accuracy: accuracyOf(r),
    score: quizScoreOf(r),
  };
}

export interface QuizRankingBoard {
  /** スコア降順（同点内は正答率降順→handle）。上位 QUIZ_RANKING_TOP_N 件。 */
  entries: QuizRankingEntry[];
  /** viewer の集計と順位（期間内に記録が無ければ null）。 */
  me: QuizRankingMe | null;
}

/** 集計行から単一スコアボード＋自分の順位を作る（決定的。同値の並びは handle で安定させる。
 *  順位は **1224式**＝同点は同順位を共有し、次の順位は人数ぶん飛ぶ（[決定] 2026-08-04）。 */
export function buildQuizRanking(
  rows: readonly QuizRankingRow[],
  viewerId: string | null,
): QuizRankingBoard {
  const sorted = [...rows].sort(
    (a, b) =>
      quizScoreOf(b) - quizScoreOf(a) ||
      accuracyOf(b) - accuracyOf(a) ||
      a.handle.localeCompare(b.handle),
  );
  const ranks = competitionRanks(sorted, scoreTie);

  let me: QuizRankingMe | null = null;
  if (viewerId !== null) {
    const mine = rows.find((r) => r.userId === viewerId);
    if (mine) {
      // sort は同一オブジェクト参照を並べ替えるだけなので indexOf で足りる（述語の再走査をしない）。
      me = {
        rank: ranks[sorted.indexOf(mine)]!,
        correct: mine.correct,
        total: mine.total,
        accuracy: accuracyOf(mine),
        score: quizScoreOf(mine),
      };
    }
  }

  return {
    entries: sorted.slice(0, QUIZ_RANKING_TOP_N).map((r, i) => toEntry(r, ranks[i]!)),
    me,
  };
}
