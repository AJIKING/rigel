"use client";

import type { QuizSessionDto } from "@rigel/client";
import {
  QUIZ_EMPTY_HISTORY_MESSAGE,
  QUIZ_KIND_LABELS,
  QUIZ_STATS_PERIODS,
  accuracyLabel,
  jstDateTime,
  quizBoardMeta,
  quizKindBoards,
  quizRecentHistory,
  type QuizStatsPeriod,
} from "@rigel/ui";
import { useMemo, useState } from "react";
import { AppHeader } from "../AppHeader";
import { MyPageTabs } from "./MyPageTabs";
import { QuizLineChart } from "./QuizLineChart";
import s from "../list/kifu-list.module.css";
import t from "./training-stats.module.css";

/**
 * マイページ「特訓」タブ（本人のみ）。**種目ごとの折れ線グラフ**（1分あたり正解数）を
 * 縦に並べ、その下に全種目まとめた直近の履歴リストを出す。トーンは特訓画面
 * （training.module.css）に合わせる。データはサーバ側（page.tsx）が listQuizSessions で
 * 取得して渡す。now はテストの決定性のため注入可能（既定は現在時刻）。
 *
 * 種目をまたいだ合算（旧「全種目」）は置かない（[決定] 2026-07-27 オーナー）:
 * 1分あたり正解数は種目ごとに1問の重さが違い、混ぜた線は「上達」ではなく
 * 「その日どの種目をやったか」で動くため。集計は @rigel/ui の quizKindBoards に一元化。
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

  const boards = useMemo(
    () => quizKindBoards(initialSessions, period, nowValue),
    [initialSessions, period, nowValue],
  );
  const history = useMemo(() => quizRecentHistory(initialSessions), [initialSessions]);

  return (
    <div className={`${s.shell} themeApp`}>
      <AppHeader active="mypage" />
      <main className={s.main}>
        <section>
          <MyPageTabs active="training" />

          {/* 期間の切替チップ（特訓画面のチップと同じピル形） */}
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
          </div>

          {/* 指標名は並んだグラフの上に1度だけ（カードの見出しは種目名が担う）。
              期間内に記録のある種目が無ければ見出しごと出さない。 */}
          {boards.length > 0 && <p className={t.metricTitle}>1分あたり正解数の推移</p>}
          {boards.map((b) => (
            <QuizLineChart key={b.kind} points={b.points} title={b.label} meta={quizBoardMeta(b)} />
          ))}

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
