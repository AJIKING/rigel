"use client";

import type { QuizSessionDto } from "@rigel/client";
import type { QuizKind } from "@rigel/schema";
import {
  QUIZ_EMPTY_HISTORY_MESSAGE,
  QUIZ_HISTORY_LIMIT,
  QUIZ_KIND_FILTERS,
  QUIZ_KIND_LABELS,
  QUIZ_STATS_PERIODS,
  accuracyLabel,
  jstDateTime,
  quizDailyStats,
  quizStatsSummary,
  type QuizStatsPeriod,
} from "@rigel/ui";
import { useMemo, useState } from "react";
import { AppHeader } from "../AppHeader";
import { MyPageTabs } from "./MyPageTabs";
import { QuizLineChart } from "./QuizLineChart";
import s from "../list/kifu-list.module.css";
import t from "./training-stats.module.css";

/**
 * マイページ「特訓」タブ（本人のみ）。サマリ（stat カード）・1分あたり正解数の推移
 * （白地カードの自前 SVG 折れ線）・直近の履歴リスト（カード行）。トーンは特訓画面
 * （training.module.css）に合わせる。データはサーバ側（page.tsx）が listQuizSessions で
 * 取得して渡す。now はテストの決定性のため注入可能（既定は現在時刻）。
 */
export function MyTrainingScreen({
  initialSessions,
  now,
}: {
  initialSessions: QuizSessionDto[];
  now?: Date;
}) {
  const [nowValue] = useState(() => now ?? new Date());
  const [period, setPeriod] = useState<QuizStatsPeriod>("7d");
  const [kind, setKind] = useState<"all" | QuizKind>("all");
  const kindFilter = kind === "all" ? undefined : kind;

  const summary = useMemo(
    () => quizStatsSummary(initialSessions, kindFilter),
    [initialSessions, kindFilter],
  );
  const points = useMemo(
    () => quizDailyStats(initialSessions, period, nowValue, kindFilter),
    [initialSessions, period, nowValue, kindFilter],
  );
  const history = useMemo(
    () =>
      initialSessions
        .filter((x) => kindFilter === undefined || x.kind === kindFilter)
        .sort((a, b) => -a.createdAt.localeCompare(b.createdAt))
        .slice(0, QUIZ_HISTORY_LIMIT),
    [initialSessions, kindFilter],
  );

  return (
    <div className={`${s.shell} themeApp`}>
      <AppHeader active="mypage" />
      <main className={s.main}>
        <section>
          <MyPageTabs active="training" />

          {/* サマリ3枠（特訓の結果画面と同じ stat カード風: 数値大きく・ラベル小さくグレー） */}
          <div className={t.stats}>
            <div className={t.stat}>
              <b>{summary.sessions}</b>
              <span>挑戦回数</span>
            </div>
            <div className={t.stat}>
              <b>{summary.bestCorrect}</b>
              <span>自己ベスト</span>
            </div>
            <div className={t.stat}>
              <b>{accuracyLabel(summary.avgAccuracy)}</b>
              <span>平均正答率</span>
            </div>
          </div>

          {/* 期間・種目の切替チップ（特訓画面のチップと同じピル形） */}
          <div className={t.toolbar}>
            <div className={t.seg} role="group" aria-label="期間切替">
              {QUIZ_STATS_PERIODS.map((p) => (
                <button
                  key={p.key}
                  type="button"
                  aria-pressed={period === p.key}
                  onClick={() => setPeriod(p.key)}
                >
                  {p.label}
                </button>
              ))}
            </div>
            <div className={t.seg} role="group" aria-label="種目で絞り込み">
              {QUIZ_KIND_FILTERS.map((k) => (
                <button
                  key={k.key}
                  type="button"
                  aria-pressed={kind === k.key}
                  onClick={() => setKind(k.key)}
                >
                  {k.label}
                </button>
              ))}
            </div>
          </div>

          {points.length > 0 && (
            <div className={t.chartCard}>
              <p className={t.chartTitle}>1分あたり正解数</p>
              <QuizLineChart points={points} />
            </div>
          )}

          {history.length === 0 ? (
            <p className={t.empty}>{QUIZ_EMPTY_HISTORY_MESSAGE}</p>
          ) : (
            <ul className={t.hist}>
              {history.map((x) => (
                <li key={x.id} className={t.row}>
                  <span className={t.rowDate}>{jstDateTime(x.createdAt)}</span>
                  <span className={t.rowKind}>{QUIZ_KIND_LABELS[x.kind]}</span>
                  <span className={t.rowScore}>
                    {x.correct} / {x.total}問
                  </span>
                  <span className={t.rowAcc}>
                    正答率 {accuracyLabel(x.total > 0 ? x.correct / x.total : null)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </main>
    </div>
  );
}
