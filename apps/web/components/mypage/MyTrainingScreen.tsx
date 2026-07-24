"use client";

import type { QuizSessionDto } from "@rigel/client";
import type { QuizKind } from "@rigel/schema";
import {
  QUIZ_KIND_LABELS,
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

const PERIODS: readonly { key: QuizStatsPeriod; label: string }[] = [
  { key: "7d", label: "7日" },
  { key: "30d", label: "30日" },
  { key: "all", label: "全期間" },
];

/** 履歴リストの表示上限（直近）。 */
const HISTORY_LIMIT = 20;

/** ISO日時 → JST の 'YYYY/MM/DD HH:MM'（履歴行の日時。集計と同じ UTC+9 固定）。 */
function jstDateTime(iso: string): string {
  const d = new Date(Date.parse(iso) + 9 * 3_600_000);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getUTCFullYear()}/${p(d.getUTCMonth() + 1)}/${p(d.getUTCDate())} ${p(
    d.getUTCHours(),
  )}:${p(d.getUTCMinutes())}`;
}

/** 正答率 0-1 → '70%'（null は '—' = 出題0問を0%と区別）。 */
function accuracyLabel(accuracy: number | null): string {
  return accuracy === null ? "—" : `${Math.round(accuracy * 100)}%`;
}

/**
 * マイページ「特訓」タブ（本人のみ）。サマリ・1分あたり正解数の推移（自前 SVG 折れ線）・
 * 直近の履歴リスト。データはサーバ側（page.tsx）が listQuizSessions で取得して渡す。
 * now はテストの決定性のため注入可能（既定は現在時刻）。
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
        .slice(0, HISTORY_LIMIT),
    [initialSessions, kindFilter],
  );

  return (
    <div className={`${s.shell} themeApp`}>
      <AppHeader active="mypage" />
      <main className={s.main}>
        <section>
          <MyPageTabs active="training" />
          <div className={s.profile}>
            <div className={s.stats}>
              <div className={s.stat}>
                <b>{summary.sessions}</b>
                <span>回数</span>
              </div>
              <div className={s.stat}>
                <b>{summary.bestCorrect}</b>
                <span>ベストスコア</span>
              </div>
              <div className={s.stat}>
                <b>{accuracyLabel(summary.avgAccuracy)}</b>
                <span>平均正答率</span>
              </div>
            </div>
          </div>

          <div className={s.toolbar}>
            <div className={t.seg} role="group" aria-label="期間切替">
              {PERIODS.map((p) => (
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
            <div className={s.sortwrap}>
              <select
                aria-label="種目で絞り込み"
                value={kind}
                onChange={(e) => setKind(e.target.value as typeof kind)}
              >
                <option value="all">全種目</option>
                {(Object.keys(QUIZ_KIND_LABELS) as QuizKind[]).map((k) => (
                  <option key={k} value={k}>
                    {QUIZ_KIND_LABELS[k]}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {points.length > 0 && (
            <div className={t.chartCard}>
              <p className={t.chartTitle}>1分あたり正解数の推移</p>
              <QuizLineChart points={points} />
            </div>
          )}

          {history.length === 0 ? (
            <div className={t.row}>まだ記録がありません</div>
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
