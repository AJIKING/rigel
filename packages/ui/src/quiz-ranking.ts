// ============================================================
// 特訓ランキング（web/mobile/api 共有の純ロジック）
// ------------------------------------------------------------
// [決定] 2026-08-04 オーナー: ランキングは強制表示（表示は常時公開のプロフィール情報
// = displayName/handle のみ。userId は返さない）・チート対策必須（対象は verified
// セッションのみ）・期間は 週間/月間/全期間。指標は「正解数」と「正答率」の2ボード。
// wire 型（QuizRankingRow/Entry/Me・期間 enum）は背骨（@rigel/schema）が単一真実源で、
// ここは並び・しきい値・上位打ち切り・自分の順位・表示文言を一元化する。
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

/** 正答率ボードの最低解答数（実装既定値）。少数プレイの 100% で埋まるのを防ぐ。 */
export const QUIZ_RANKING_MIN_TOTAL = 50;

// ---- 表示文言（web/mobile で共有。表記ゆれ防止） ----

/** ボードの空状態。 */
export const QUIZ_RANKING_EMPTY_MESSAGE = "まだ記録がありません";

/** 正答率ボードのしきい値注記。 */
export const QUIZ_RANKING_ACCURACY_NOTE = `${QUIZ_RANKING_MIN_TOTAL}問以上回答した人が対象`;

/** 自分の順位行で、正答率ボードの対象外（最低解答数未満）のときの文言。 */
export const QUIZ_RANKING_ME_EXCLUDED_NOTE = `対象外（${QUIZ_RANKING_MIN_TOTAL}問以上で掲載）`;

/** displayName も handle も空のときの表示名フォールバック。 */
export const QUIZ_RANKING_NAME_FALLBACK = "プレイヤー";

/** ランキングへの導線ラベル（特訓の種目選択・結果画面・マイページで共用）。 */
export const QUIZ_RANKING_LINK_LABEL = "ランキングを見る";

/** 2ボードの見出し（web/mobile 共有）。 */
export const QUIZ_RANKING_BOARD_LABELS = { correct: "正解数", accuracy: "正答率" } as const;

/** 表示名の解決規則（displayName → handle → フォールバック）。web/mobile が同じ規則を使う
 *  （片方だけ変えて表示が割れないように、規則ごと共有する）。 */
export function quizRankingName(e: Pick<QuizRankingEntry, "displayName" | "handle">): string {
  return e.displayName || e.handle || QUIZ_RANKING_NAME_FALLBACK;
}

function accuracyOf(r: { correct: number; total: number }): number {
  return r.total > 0 ? r.correct / r.total : 0;
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

/** 正解数ボードの同点判定（物差しは correct のみ。正答率は表示順の副キー）。 */
const correctTie = (a: QuizRankingRow, b: QuizRankingRow) => a.correct === b.correct;

/** 正答率ボードの同点判定。分数として比較する（90/100 と 45/50 は同率。
 *  浮動小数の丸め誤差で同率が別順位に割れないよう交差積で判定）。 */
const accuracyTie = (a: QuizRankingRow, b: QuizRankingRow) =>
  a.correct * b.total === b.correct * a.total;

function toEntry(r: QuizRankingRow, rank: number): QuizRankingEntry {
  return {
    rank,
    handle: r.handle,
    displayName: r.displayName,
    correct: r.correct,
    total: r.total,
    accuracy: accuracyOf(r),
  };
}

export interface QuizRankingBoards {
  /** 正解数ボード（correct 降順→正答率降順→handle）。上位 QUIZ_RANKING_TOP_N 件。 */
  correct: QuizRankingEntry[];
  /** 正答率ボード（最低解答数を満たす人のみ。accuracy 降順→correct 降順→handle）。 */
  accuracy: QuizRankingEntry[];
  /** viewer の集計と順位（期間内に記録が無ければ null）。 */
  me: QuizRankingMe | null;
}

/** 集計行から 2ボード＋自分の順位を作る（決定的。同値の並びは handle で安定させる。
 *  順位は **1224式**＝同点は同順位を共有し、次の順位は人数ぶん飛ぶ（[決定] 2026-08-04）。 */
export function buildQuizRanking(
  rows: readonly QuizRankingRow[],
  viewerId: string | null,
): QuizRankingBoards {
  const byCorrect = [...rows].sort(
    (a, b) =>
      b.correct - a.correct || accuracyOf(b) - accuracyOf(a) || a.handle.localeCompare(b.handle),
  );
  const byAccuracy = rows
    .filter((r) => r.total >= QUIZ_RANKING_MIN_TOTAL)
    .sort(
      (a, b) =>
        accuracyOf(b) - accuracyOf(a) || b.correct - a.correct || a.handle.localeCompare(b.handle),
    );
  const correctRanks = competitionRanks(byCorrect, correctTie);
  const accuracyRanks = competitionRanks(byAccuracy, accuracyTie);

  let me: QuizRankingMe | null = null;
  if (viewerId !== null) {
    const mine = rows.find((r) => r.userId === viewerId);
    if (mine) {
      // sort は同一オブジェクト参照を並べ替えるだけなので indexOf で足りる（述語の再走査をしない）。
      const accuracyIndex = byAccuracy.indexOf(mine);
      me = {
        correctRank: correctRanks[byCorrect.indexOf(mine)]!,
        accuracyRank: accuracyIndex < 0 ? null : accuracyRanks[accuracyIndex]!,
        correct: mine.correct,
        total: mine.total,
        accuracy: accuracyOf(mine),
      };
    }
  }

  return {
    correct: byCorrect.slice(0, QUIZ_RANKING_TOP_N).map((r, i) => toEntry(r, correctRanks[i]!)),
    accuracy: byAccuracy.slice(0, QUIZ_RANKING_TOP_N).map((r, i) => toEntry(r, accuracyRanks[i]!)),
    me,
  };
}
