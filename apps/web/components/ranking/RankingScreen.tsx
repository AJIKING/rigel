"use client";

import type { QuizRankingDto, QuizRankingPeriodDto } from "@rigel/client";
import type { QuizKind } from "@rigel/schema";
import {
  accuracyLabel,
  quizRankingName,
  quizScoreLabel,
  LIST_LOAD_ERROR_MESSAGE,
  QUIZ_KIND_LABELS,
  QUIZ_KINDS,
  QUIZ_RANKING_BOARD_LABEL,
  QUIZ_RANKING_EMPTY_MESSAGE,
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
 * 種目×期間（週間/月間/全期間）で単一の「スコア」ボードを出す
 * （スコア = 正解数 × 正答率。[決定] 2026-08-07 2ボードから統合）。
 * 載るのは verified セッション（サーバ再採点済み）の集計値と常時公開のプロフィール情報
 * （displayName/handle）のみ。サインイン時は自分の順位（圏外含む）を上に出す。
 * 初期表示はサーバ取得（page.tsx）・セレクト切替はサーバアクションで再取得。
 */

/** 絞り込みセレクト（種目/期間）。見た目は一覧ツールバーの状態セレクト（.sortwrap）と同じ部品。 */
function FilterSelect<K extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: K;
  options: readonly (readonly [K, string])[];
  onChange: (value: K) => void;
}) {
  return (
    <div className={s.sortwrap}>
      <select aria-label={label} value={value} onChange={(e) => onChange(e.target.value as K)}>
        {options.map(([key, text]) => (
          <option key={key} value={key}>
            {text}
          </option>
        ))}
      </select>
    </div>
  );
}
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
  /** セレクト切替の取得中（前の表示は保ったまま薄くして待つ。真っ白にしない）。 */
  const [pending, setPending] = useState(false);
  /** 連打時に古い応答で新しい選択を上書きしないための世代カウンタ。 */
  const genRef = useRef(0);

  function select(nextKind: QuizKind, nextPeriod: QuizRankingPeriodDto) {
    // 同一値の再選択で同一内容を取り直さない（エラー中・初期取得失敗中は再試行として通す）。
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
        {/* ボード幅（620px）の1カラムに全体を寄せ、広幅で左に張り付かないよう中央に置く。 */}
        <section className={r.col}>
          <div className={s.head}>
            <h1>ランキング</h1>
          </div>
          {/* 絞り込みはセレクトボックス（チップ列から置換。2026-08-08 オーナー）。 */}
          <div className={r.toolbar}>
            <FilterSelect
              label="種目"
              value={kind}
              options={QUIZ_KINDS.map((k) => [k, QUIZ_KIND_LABELS[k]] as const)}
              onChange={(k) => select(k, period)}
            />
            <FilterSelect
              label="期間"
              value={period}
              options={QUIZ_RANKING_PERIODS.map((p) => [p.key, p.label] as const)}
              onChange={(p) => select(kind, p)}
            />
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
                あなた: <b>{data.me.rank}位</b>（{QUIZ_RANKING_BOARD_LABEL}{" "}
                {quizScoreLabel(data.me.score)}）
              </span>
              <span>
                {data.me.correct}問・{accuracyLabel(data.me.accuracy)}
              </span>
            </p>
          )}

          {/* data=null（初期取得失敗）はボードを出さない（上のエラー文言が案内。
              セレクト操作で再取得できる）。取得中は前の表示を保ったまま薄くする。 */}
          {data && (
            <div className={`${r.boards} ${pending ? r.busy : ""}`} aria-busy={pending}>
              {data.entries.length === 0 ? (
                <p className={r.empty}>{QUIZ_RANKING_EMPTY_MESSAGE}</p>
              ) : (
                <ol className={r.list} aria-label={`${QUIZ_RANKING_BOARD_LABEL}ランキング`}>
                  {data.entries.map((e) => (
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
                      {/* 内訳（正解数・正答率）を添えてスコアの根拠を見えるようにする。 */}
                      <span className={r.sub}>
                        {e.correct}問・{accuracyLabel(e.accuracy)}
                      </span>
                      <span className={r.value}>{quizScoreLabel(e.score)}</span>
                    </li>
                  ))}
                </ol>
              )}
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
