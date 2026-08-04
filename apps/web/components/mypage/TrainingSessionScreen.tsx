"use client";

import type { QuizSessionDetailDto } from "@rigel/client";
import { accuracyLabel, jstDateTime, QUIZ_KIND_LABELS, QUIZ_RECORDS_PAID_NOTE } from "@rigel/ui";
import Link from "next/link";
import { AppHeader } from "../AppHeader";
import { QuizReviewList } from "../training/QuizReviewList";
import s from "../list/kifu-list.module.css";
import tr from "../training/training.module.css";
import t from "./training-stats.module.css";

/**
 * 特訓セッション詳細（/mypage/training/[sessionId]・本人のみ）。
 * 有料はサーバ保存の見直しレコード（結果画面と同じ QuizReviewList）を表示し、
 * 無料・ダウングレード後は records=null なので案内＋プラン導線を出す
 * （[決定] 2026-08-04 ⑤ ダウングレード時は全て閲覧不可。行は保持されるので
 * 再アップグレードで閲覧が復活する。Plan: docs/plans/quiz-open-and-ranking.md Phase 3）。
 */
export function TrainingSessionScreen({ session }: { session: QuizSessionDetailDto }) {
  return (
    <div className={`${s.shell} themeApp`}>
      <AppHeader active="mypage" />
      <main className={s.main}>
        <section>
          <p className={t.backRow}>
            <Link href="/mypage/training">← 特訓の記録</Link>
          </p>
          <h1 className={t.detailTitle}>{QUIZ_KIND_LABELS[session.kind]}</h1>
          <p className={t.detailDate}>{jstDateTime(session.createdAt)}</p>
          {/* スコアは結果画面と同じ stat カード横並び。 */}
          <div className={tr.stats}>
            <span className={tr.stat}>正解 {session.correct}問</span>
            <span className={tr.stat}>出題 {session.total}問</span>
            <span className={tr.stat}>
              {/* 正答率の表記はマイページ一覧と同じ accuracyLabel（0問は — 表示）。 */}
              正答率 {accuracyLabel(session.total > 0 ? session.correct / session.total : null)}
            </span>
          </div>
          {session.records === null ? (
            <p className={t.paidNote}>
              {QUIZ_RECORDS_PAID_NOTE}
              <Link href="/settings">プランを見る</Link>
            </p>
          ) : (
            <QuizReviewList records={session.records} />
          )}
        </section>
      </main>
    </div>
  );
}
