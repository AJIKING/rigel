"use client";

import type { QuizRankingDto, QuizRankingEntryDto, QuizRankingPeriodDto } from "@rigel/client";
import type { QuizKind } from "@rigel/schema";
import {
  accuracyLabel,
  quizRankingName,
  LIST_LOAD_ERROR_MESSAGE,
  QUIZ_KIND_LABELS,
  QUIZ_KINDS,
  QUIZ_RANKING_ACCURACY_NOTE,
  QUIZ_RANKING_BOARD_LABELS,
  QUIZ_RANKING_EMPTY_MESSAGE,
  QUIZ_RANKING_ME_EXCLUDED_NOTE,
  QUIZ_RANKING_PERIODS,
} from "@rigel/ui";
import Link from "next/link";
import { useRef, useState } from "react";
import { getQuizRankingAction } from "../../app/actions";
import { AppHeader } from "../AppHeader";
import s from "../list/kifu-list.module.css";
import r from "./ranking.module.css";

/**
 * 特訓ランキング（/ranking・公開ページ。[決定] 2026-08-04 強制表示）。
 * 種目×期間（週間/月間/全期間）で「正解数」「正答率」の2ボードを出す。
 * 載るのは verified セッション（サーバ再採点済み）の集計値と常時公開のプロフィール情報
 * （displayName/handle）のみ。サインイン時は自分の順位（圏外含む）を上に出す。
 * 初期表示はサーバ取得（page.tsx）・チップ切替はサーバアクションで再取得。
 */
export function RankingScreen({
  initial,
  fetchRanking = getQuizRankingAction,
}: {
  /** 初期表示のデータ（null=サーバ取得失敗。「0件」と混同させずエラー表示にする）。 */
  initial: QuizRankingDto | null;
  /** テスト用の注入口（既定はサーバアクション）。 */
  fetchRanking?: typeof getQuizRankingAction;
}) {
  const [data, setData] = useState<QuizRankingDto | null>(initial);
  const [kind, setKind] = useState<QuizKind>(initial?.kind ?? QUIZ_KINDS[0]!);
  const [period, setPeriod] = useState<QuizRankingPeriodDto>(initial?.period ?? "weekly");
  const [error, setError] = useState(initial === null);
  /** チップ切替の取得中（前の表示は保ったまま薄くして待つ。真っ白にしない）。 */
  const [pending, setPending] = useState(false);
  /** 連打時に古い応答で新しい選択を上書きしないための世代カウンタ。 */
  const genRef = useRef(0);

  function select(nextKind: QuizKind, nextPeriod: QuizRankingPeriodDto) {
    // 選択中チップの再タップで同一内容を取り直さない（エラー中・初期取得失敗中は再試行として通す）。
    if (!error && data !== null && nextKind === kind && nextPeriod === period) return;
    setKind(nextKind);
    setPeriod(nextPeriod);
    const gen = ++genRef.current;
    setPending(true);
    fetchRanking(nextKind, nextPeriod)
      .then((d) => {
        if (genRef.current !== gen) return;
        setData(d);
        setError(false);
      })
      .catch(() => {
        if (genRef.current === gen) setError(true);
      })
      .finally(() => {
        if (genRef.current === gen) setPending(false);
      });
  }

  return (
    <div className={`${s.shell} themeApp`}>
      <AppHeader active="ranking" />
      <main className={s.main}>
        <section>
          <div className={s.head}>
            <h1>ランキング</h1>
          </div>
          <div className={r.toolbar}>
            <div className={r.seg} role="group" aria-label="種目切替">
              {QUIZ_KINDS.map((k) => (
                <button
                  key={k}
                  type="button"
                  aria-pressed={kind === k}
                  onClick={() => select(k, period)}
                >
                  {QUIZ_KIND_LABELS[k]}
                </button>
              ))}
            </div>
            <div className={r.seg} role="group" aria-label="期間切替">
              {QUIZ_RANKING_PERIODS.map((p) => (
                <button
                  key={p.key}
                  type="button"
                  aria-pressed={period === p.key}
                  onClick={() => select(kind, p.key)}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          {error && (
            <p className={r.error} role="alert">
              {LIST_LOAD_ERROR_MESSAGE}
            </p>
          )}

          {/* 自分の順位（サインインかつ期間内に verified 記録があるときのみ）。 */}
          {data?.me && (
            <p className={r.meRow}>
              <span>
                あなた: 正解数 <b>{data.me.correctRank}位</b>（{data.me.correct}問）
              </span>
              <span>
                正答率{" "}
                {data.me.accuracyRank === null ? (
                  <>{QUIZ_RANKING_ME_EXCLUDED_NOTE}</>
                ) : (
                  <>
                    <b>{data.me.accuracyRank}位</b>（{accuracyLabel(data.me.accuracy)}）
                  </>
                )}
              </span>
            </p>
          )}

          {/* data=null（初期取得失敗）はボードを出さない（上のエラー文言が案内。
              チップ操作で再取得できる）。取得中は前の表示を保ったまま薄くする。 */}
          {data && (
            <div className={`${r.boards} ${pending ? r.busy : ""}`} aria-busy={pending}>
              <Board
                title={QUIZ_RANKING_BOARD_LABELS.correct}
                entries={data.correct}
                value={(e) => `${e.correct}問`}
              />
              <Board
                title={QUIZ_RANKING_BOARD_LABELS.accuracy}
                note={QUIZ_RANKING_ACCURACY_NOTE}
                entries={data.accuracy}
                value={(e) => accuracyLabel(e.accuracy)}
              />
            </div>
          )}
        </section>
      </main>
    </div>
  );
}

function Board({
  title,
  note,
  entries,
  value,
}: {
  title: string;
  note?: string;
  entries: QuizRankingEntryDto[];
  value: (e: QuizRankingEntryDto) => string;
}) {
  return (
    <div className={r.board}>
      <h2 className={r.boardTitle}>{title}</h2>
      {note && <p className={r.boardNote}>{note}</p>}
      {entries.length === 0 ? (
        <p className={r.empty}>{QUIZ_RANKING_EMPTY_MESSAGE}</p>
      ) : (
        <ol className={r.list} aria-label={`${title}ランキング`}>
          {entries.map((e) => (
            <li key={`${e.rank}-${e.handle}`} className={r.row}>
              <span className={`${r.rank} ${e.rank <= 3 ? r.rankTop : ""}`}>{e.rank}</span>
              {/* 表示は常時公開のプロフィール情報のみ（解決規則は quizRankingName に共有）。
                  handle があれば公開ページへリンクする。 */}
              {e.handle ? (
                <Link href={`/u/${e.handle}`} className={r.name}>
                  {quizRankingName(e)}
                </Link>
              ) : (
                <span className={r.name}>{quizRankingName(e)}</span>
              )}
              <span className={r.value}>{value(e)}</span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
