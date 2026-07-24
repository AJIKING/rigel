"use client";

import type { QuizKind, Tile } from "@rigel/schema";
import {
  ANALYTICS_EVENTS,
  createQuizRng,
  generateChinitsuQuestion,
  generateEfficiencyQuestion,
  tileLabel,
  QUIZ_FREE_NOTE,
  QUIZ_KIND_DESCRIPTIONS,
  QUIZ_KIND_LABELS,
  QUIZ_LIMIT_MESSAGE,
  QUIZ_SESSION_SECONDS,
  type ChinitsuQuestion,
  type EfficiencyQuestion,
  type QuizAnswerRecord,
} from "@rigel/ui";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { finishQuizSessionAction, startQuizSessionAction } from "../../app/actions";
import { trackEvent } from "../../lib/analytics";
import { useAuth } from "../../lib/auth-context";
import { AppHeader } from "../AppHeader";
import { OssTileFace } from "../OssTileFace";
import s from "./training.module.css";

const KINDS: readonly QuizKind[] = ["chinitsu", "efficiency"];

type Question = ChinitsuQuestion | EfficiencyQuestion;
type Phase = "select" | "running" | "result";

/** 回答後に○×（正誤のみ・正答は見せない）を表示してから次問へ進むまでの時間（ミリ秒）。 */
const FEEDBACK_MS = 500;

/**
 * 特訓画面（/training)。60秒タイムアタックで清一色多面待ち・牌効率を反復する。
 * 出題・採点はクライアントの決定的アルゴリズム（@rigel/ui）。回数制限（無料1日3回）は
 * 開始 API がサーバ強制する（Plan: docs/plans/quiz-training.md）。
 * seed はテストで出題列を固定するための注入口（未指定は Date.now()）。
 */
export function TrainingScreen({ seed }: { seed?: number }) {
  const { user, loading } = useAuth();

  const [phase, setPhase] = useState<Phase>("select");
  const [kind, setKind] = useState<QuizKind>("chinitsu");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  /** free の本日の残り回数（開始応答ベース。有料は null=無制限で表示しない）。 */
  const [remainingToday, setRemainingToday] = useState<number | null>(null);
  const [question, setQuestion] = useState<Question | null>(null);
  const [total, setTotal] = useState(0);
  const [correct, setCorrect] = useState(0);
  const [secondsLeft, setSecondsLeft] = useState(QUIZ_SESSION_SECONDS);
  const [starting, setStarting] = useState(false);
  /** 清一色: 選択中の待ち牌（回答前）。 */
  const [picked, setPicked] = useState<readonly Tile[]>([]);
  /** 回答直後の正誤表示（0.5秒だけ出して次問へ）。null=回答受付中。 */
  const [feedback, setFeedback] = useState<"ok" | "ng" | null>(null);
  /** 見直しリスト（回答済みの問題のみ。セッション内だけで保持しサーバへは送らない）。 */
  const [records, setRecords] = useState<readonly QuizAnswerRecord[]>([]);
  /** 結果送信の失敗（結果画面は出したままエラーを小さく表示）。 */
  const [sendError, setSendError] = useState(false);

  const sessionIdRef = useRef<string | null>(null);
  const rngRef = useRef<(() => number) | null>(null);
  const feedbackTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const nextQuestion = useCallback((k: QuizKind) => {
    const rng = rngRef.current;
    if (!rng) return;
    setQuestion(k === "chinitsu" ? generateChinitsuQuestion(rng) : generateEfficiencyQuestion(rng));
    setPicked([]);
    setFeedback(null);
  }, []);

  // アンマウント時に正解表示タイマーを残さない。
  useEffect(
    () => () => {
      if (feedbackTimerRef.current) clearTimeout(feedbackTimerRef.current);
    },
    [],
  );

  /** 採点して○×だけを0.5秒表示し、次問へ進む（誤答もスキップ扱いで次問へ）。
   *  回答は見直しリストに記録する（正答の確認は結果画面で行う）。 */
  function grade(ok: boolean, myAnswer: readonly Tile[]) {
    setTotal((t) => t + 1);
    if (ok) setCorrect((c) => c + 1);
    if (question) setRecords((rs) => [...rs, { question, picked: [...myAnswer], ok }]);
    setFeedback(ok ? "ok" : "ng");
    feedbackTimerRef.current = setTimeout(() => nextQuestion(kind), FEEDBACK_MS);
  }

  /** 清一色: 待ち牌候補のトグル選択。 */
  function toggleWait(tile: Tile) {
    if (feedback !== null) return;
    setPicked((p) => (p.includes(tile) ? p.filter((x) => x !== tile) : [...p, tile]));
  }

  /** 清一色: 回答（待ち牌の完全一致のみ正解）。 */
  function submitChinitsu() {
    if (!question || question.kind !== "chinitsu" || feedback !== null || picked.length === 0) {
      return;
    }
    const answer = new Set<Tile>(question.answer);
    grade(picked.length === answer.size && picked.every((t) => answer.has(t)), picked);
  }

  /** 牌効率: 牌タップ=その牌を切る（bestDiscards に含まれれば正解）。 */
  function discardTile(tile: Tile) {
    if (!question || question.kind !== "efficiency" || feedback !== null) return;
    grade(question.answer.includes(tile), [tile]);
  }

  // 60秒カウントダウン（セッション中のみ）。
  useEffect(() => {
    if (phase !== "running") return;
    const id = setInterval(() => setSecondsLeft((sec) => Math.max(0, sec - 1)), 1000);
    return () => clearInterval(id);
  }, [phase]);

  // 60秒経過: 回答中の問題は打ち切って結果画面へ。結果はサーバに記録する
  // （送信に失敗してもUIは結果を出す。エラーは小さく表示）。
  useEffect(() => {
    if (phase !== "running" || secondsLeft > 0) return;
    if (feedbackTimerRef.current) clearTimeout(feedbackTimerRef.current);
    setPhase("result");
    trackEvent(ANALYTICS_EVENTS.quizComplete, { kind });
    const sessionId = sessionIdRef.current;
    if (!sessionId) return;
    finishQuizSessionAction(sessionId, {
      kind,
      total,
      correct,
      durationMs: QUIZ_SESSION_SECONDS * 1000,
    })
      .then((r) => {
        if (!r.ok) setSendError(true);
      })
      .catch(() => setSendError(true));
  }, [phase, secondsLeft, kind, total, correct]);

  async function start(k: QuizKind) {
    if (starting) return;
    setStarting(true);
    try {
      const res = await startQuizSessionAction(k).catch(() => ({ ok: false as const, status: 0 }));
      if (!res.ok) {
        setErrorMsg(
          res.status === 402
            ? QUIZ_LIMIT_MESSAGE
            : "開始できませんでした。少し待って再度お試しください。",
        );
        return;
      }
      setErrorMsg(null);
      setSendError(false);
      sessionIdRef.current = res.id;
      setRemainingToday(res.remainingToday);
      // 出題はシード付きの決定的生成（テストは seed 注入で期待値を固定できる）。
      rngRef.current = createQuizRng(seed ?? Date.now());
      setKind(k);
      setTotal(0);
      setCorrect(0);
      setRecords([]);
      setSecondsLeft(QUIZ_SESSION_SECONDS);
      trackEvent(ANALYTICS_EVENTS.quizStart, { kind: k });
      nextQuestion(k);
      setPhase("running");
    } finally {
      setStarting(false);
    }
  }

  return (
    <div className={`${s.shell} themeApp`}>
      <AppHeader active="training" />
      <main className={s.main}>
        <div className={s.head}>
          <h1>特訓</h1>
          <p>60秒でどれだけ解ける？ 反復で読みを速くする</p>
        </div>

        {loading ? null : !user ? (
          <p className={s.loginNote}>
            特訓するには <Link href="/login">ログイン</Link> してください。
          </p>
        ) : phase === "select" ? (
          <section>
            <div className={s.cards}>
              {KINDS.map((k) => (
                <button
                  key={k}
                  type="button"
                  className={s.card}
                  disabled={starting}
                  onClick={() => void start(k)}
                >
                  <span className={s.cardTitle}>{QUIZ_KIND_LABELS[k]}</span>
                  <span className={s.cardDesc}>{QUIZ_KIND_DESCRIPTIONS[k]}</span>
                </button>
              ))}
            </div>
            {errorMsg && (
              <p className={s.error} role="alert">
                {errorMsg}
              </p>
            )}
            {/* 無料枠の使い切り（402）にはプラン変更 UI（設定）へのアップグレード導線を添える。 */}
            {errorMsg === QUIZ_LIMIT_MESSAGE && (
              <Link href="/settings" className={s.upgrade}>
                プランをアップグレード
              </Link>
            )}
            {user.plan === "free" && <p className={s.note}>{QUIZ_FREE_NOTE}</p>}
          </section>
        ) : phase === "result" ? (
          <section className={s.result}>
            <h2>結果</h2>
            <p className={s.resultLine}>{QUIZ_KIND_LABELS[kind]}</p>
            <p className={s.resultLine}>
              正解 {correct} / {total}問
            </p>
            <p className={s.resultLine}>
              正答率 {total > 0 ? Math.round((correct / total) * 100) : 0}%
            </p>
            {/* セッションは60秒固定なので出題数=1分あたりの回答ペース。 */}
            <p className={s.resultLine}>1分あたり{total}問</p>
            {/* 見直しリスト: 回答した問題だけを○×・手牌・あなたの回答・正解つきで振り返る
                （セッション中は正答を見せないぶんここで確認する。サーバには送らない）。 */}
            {records.length > 0 && (
              <div className={s.review}>
                <h3 className={s.reviewHead}>見直し</h3>
                <ol className={s.reviewList} aria-label="見直しリスト">
                  {records.map((r, i) => (
                    <li key={i} className={s.reviewRow}>
                      <span className={s.reviewNo}>
                        {i + 1}
                        <span className={`${s.reviewMark} ${r.ok ? s.ok : s.ng}`}>
                          {r.ok ? "○" : "×"}
                        </span>
                      </span>
                      <span role="group" aria-label="問題" className={s.reviewTiles}>
                        {r.question.tiles.map((t, j) => (
                          <span key={j} className={s.reviewTile}>
                            <OssTileFace code={t} />
                          </span>
                        ))}
                      </span>
                      <span className={s.reviewAnswer}>
                        <span className={s.reviewLabel}>あなたの回答</span>
                        <span role="group" aria-label="あなたの回答" className={s.reviewTiles}>
                          {r.picked.map((t, j) => (
                            <span key={j} className={s.reviewTile}>
                              <OssTileFace code={t} />
                            </span>
                          ))}
                        </span>
                      </span>
                      <span className={s.reviewAnswer}>
                        <span className={s.reviewLabel}>正解</span>
                        <span role="group" aria-label="正解" className={s.reviewTiles}>
                          {r.question.answer.map((t, j) => (
                            <span key={j} className={s.reviewTile}>
                              <OssTileFace code={t} />
                            </span>
                          ))}
                        </span>
                      </span>
                    </li>
                  ))}
                </ol>
              </div>
            )}
            {remainingToday !== null && <p className={s.note}>今日あと{remainingToday}回</p>}
            {sendError && <p className={s.sendError}>結果の送信に失敗しました。</p>}
            <button type="button" className={s.retry} onClick={() => setPhase("select")}>
              もう一度
            </button>
          </section>
        ) : (
          <section>
            <div className={s.hud}>
              <span className={s.hudKind}>{QUIZ_KIND_LABELS[kind]}</span>
              <span className={s.hudScore}>
                正解 {correct} / {total}問
              </span>
              <span className={s.hudTime}>残り {secondsLeft}秒</span>
              {remainingToday !== null && (
                <span className={s.hudRemain}>今日あと{remainingToday}回</span>
              )}
            </div>
            {question && (
              <QuestionPanel
                question={question}
                picked={picked}
                feedback={feedback}
                onToggleWait={toggleWait}
                onSubmitChinitsu={submitChinitsu}
                onDiscard={discardTile}
              />
            )}
          </section>
        )}
      </main>
    </div>
  );
}

/** 出題エリア（清一色=待ち牌の複数選択 / 牌効率=切る牌のタップ）。 */
function QuestionPanel({
  question,
  picked,
  feedback,
  onToggleWait,
  onSubmitChinitsu,
  onDiscard,
}: {
  question: Question;
  picked: readonly Tile[];
  feedback: "ok" | "ng" | null;
  onToggleWait: (tile: Tile) => void;
  onSubmitChinitsu: () => void;
  onDiscard: (tile: Tile) => void;
}) {
  const grading = feedback !== null;
  const feedbackEl = grading && (
    <span className={`${s.feedback} ${feedback === "ok" ? s.ok : s.ng}`} role="status">
      {feedback === "ok" ? "正解！" : "不正解…"}
    </span>
  );

  if (question.kind === "chinitsu") {
    // 候補は出題スート（単色）の1〜9。回答後も正答は見せない（○×のみ。見直しは結果画面）。
    const suit = question.tiles[0]![1]!;
    const candidates = Array.from({ length: 9 }, (_, i) => `${i + 1}${suit}` as Tile);
    return (
      <div className={s.panel}>
        <p className={s.question}>待ち牌を全部選んで「回答」（完全一致で正解）</p>
        <span className={s.hand}>
          {question.tiles.map((t, i) => (
            <span key={i} className={s.tile}>
              <OssTileFace code={t} />
            </span>
          ))}
        </span>
        <div className={s.candidates}>
          {candidates.map((t) => {
            const on = picked.includes(t);
            return (
              <button
                key={t}
                type="button"
                className={`${s.tile} ${on ? s.sel : ""}`}
                aria-label={tileLabel(t)}
                aria-pressed={on}
                disabled={grading}
                onClick={() => onToggleWait(t)}
              >
                <OssTileFace code={t} />
              </button>
            );
          })}
        </div>
        <div className={s.submitRow}>
          <button
            type="button"
            className={s.submit}
            disabled={grading || picked.length === 0}
            onClick={onSubmitChinitsu}
          >
            回答
          </button>
          {feedbackEl}
        </div>
      </div>
    );
  }

  return (
    <div className={s.panel}>
      <p className={s.question}>受け入れが最大になる牌をタップして切る</p>
      <span className={s.hand}>
        {question.tiles.map((t, i) => (
          <button
            key={i}
            type="button"
            className={s.tile}
            aria-label={tileLabel(t)}
            disabled={grading}
            onClick={() => onDiscard(t)}
          >
            <OssTileFace code={t} />
          </button>
        ))}
      </span>
      <div className={s.submitRow}>{feedbackEl}</div>
    </div>
  );
}
