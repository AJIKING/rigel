"use client";

import type { QuizKind, Tile } from "@rigel/schema";
import {
  ANALYTICS_EVENTS,
  bestUkeires,
  createQuizRng,
  discardUkeires,
  generateChinitsuQuestion,
  generateEfficiencyQuestion,
  tileLabel,
  QUIZ_KIND_DESCRIPTIONS,
  QUIZ_KIND_LABELS,
  QUIZ_KIND_PROMPTS,
  QUIZ_LIMIT_MESSAGE,
  QUIZ_SESSION_SECONDS,
  type ChinitsuQuestion,
  type EfficiencyQuestion,
  type QuizAnswerRecord,
} from "@rigel/ui";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { finishQuizSessionAction, startQuizSessionAction } from "../../app/actions";
import { trackEvent } from "../../lib/analytics";
import type { AuthUser } from "../../lib/api";
import { useAuth } from "../../lib/auth-context";
import { AppHeader } from "../AppHeader";
import { OssTileFace } from "../OssTileFace";
import s from "./training.module.css";

const KINDS: readonly QuizKind[] = ["chinitsu", "efficiency"];

/** 種目カードの装飾（牌モチーフ3枚をファン状に。清一色=索子・牌効率=筒子）。装飾なので a11y からは隠す。 */
const CARD_MOTIF: Record<QuizKind, readonly Tile[]> = {
  chinitsu: ["3s", "5s", "7s"],
  efficiency: ["3p", "5p", "7p"],
};

type Question = ChinitsuQuestion | EfficiencyQuestion;
type Phase = "select" | "running" | "result";

/** 回答後に○×（正誤のみ・正答は見せない）を表示してから次問へ進むまでの時間（ミリ秒）。 */
const FEEDBACK_MS = 500;

/**
 * 特訓画面（/training)。60秒タイムアタックで清一色多面待ち・牌効率を反復する。
 * 出題・採点はクライアントの決定的アルゴリズム（@rigel/ui）。回数制限（無料1日3回）は
 * 開始 API がサーバ強制する（Plan: docs/plans/quiz-training.md）。
 * seed はテストで出題列を固定するための注入口（未指定は Date.now()）。
 * user / startSession / finishSession / sessionSeconds は /dev/training（API・ログイン不要の
 * プレビュー）とテスト用の注入口。既定は本物（useAuth / Server Action / 60秒）。
 */
export function TrainingScreen({
  seed,
  sessionSeconds = QUIZ_SESSION_SECONDS,
  user: userOverride,
  startSession = startQuizSessionAction,
  finishSession = finishQuizSessionAction,
}: {
  seed?: number;
  /** 1回の挑戦の秒数（dev プレビューで短縮する注入口。既定は QUIZ_SESSION_SECONDS=60）。 */
  sessionSeconds?: number;
  /** 認証ユーザーの上書き（undefined なら useAuth の実状態。null は未ログイン表示）。 */
  user?: AuthUser | null;
  startSession?: typeof startQuizSessionAction;
  finishSession?: typeof finishQuizSessionAction;
}) {
  const auth = useAuth();
  const user = userOverride === undefined ? auth.user : userOverride;
  const loading = userOverride === undefined ? auth.loading : false;

  const [phase, setPhase] = useState<Phase>("select");
  const [kind, setKind] = useState<QuizKind>("chinitsu");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [question, setQuestion] = useState<Question | null>(null);
  const [total, setTotal] = useState(0);
  const [correct, setCorrect] = useState(0);
  const [secondsLeft, setSecondsLeft] = useState(sessionSeconds);
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
    finishSession(sessionId, {
      kind,
      total,
      correct,
      durationMs: sessionSeconds * 1000,
    })
      .then((r) => {
        if (!r.ok) setSendError(true);
      })
      .catch(() => setSendError(true));
  }, [phase, secondsLeft, kind, total, correct, finishSession, sessionSeconds]);

  async function start(k: QuizKind) {
    if (starting) return;
    setStarting(true);
    try {
      const res = await startSession(k).catch(() => ({ ok: false as const, status: 0 }));
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
      // 残り回数（res.remainingToday）は表示しない（[決定] 2026-07-25 オーナーレビュー。
      // 上限は 402 時の文言とプランカードで伝える）。
      // 出題はシード付きの決定的生成（テストは seed 注入で期待値を固定できる）。
      rngRef.current = createQuizRng(seed ?? Date.now());
      setKind(k);
      setTotal(0);
      setCorrect(0);
      setRecords([]);
      setSecondsLeft(sessionSeconds);
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
        </div>

        {loading ? (
          // 認証確認中に真っ白にしない（他画面と同じ控えめな文言。role=status で支援技術にも伝える）。
          <p className={s.loginNote} role="status">
            読み込み中…
          </p>
        ) : !user ? (
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
                  <span className={s.cardFan} aria-hidden="true">
                    {CARD_MOTIF[k].map((t, i) => (
                      <span key={i} className={s.fanTile}>
                        <OssTileFace code={t} />
                      </span>
                    ))}
                  </span>
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
          </section>
        ) : phase === "result" ? (
          <section className={s.result}>
            <h2>結果</h2>
            <p className={s.resultLine}>{QUIZ_KIND_LABELS[kind]}</p>
            {/* スコアは stat カード横並び（正解数・出題数・正答率）。60秒固定なので
                「1分あたり」は出さない（正解/出題と意味が重複するため）。 */}
            <div className={s.stats}>
              <span className={s.stat}>正解 {correct}問</span>
              <span className={s.stat}>出題 {total}問</span>
              <span className={s.stat}>
                正答率 {total > 0 ? Math.round((correct / total) * 100) : 0}%
              </span>
            </div>
            {/* 見直しリスト: 回答した問題だけを○×・手牌・あなたの回答・正解つきで振り返る
                （セッション中は正答を見せないぶんここで確認する。サーバには送らない）。 */}
            {records.length > 0 && (
              <div className={s.review}>
                {/* 見出しテキストは置かずリストを直接置く（aria-label は維持。
                    [決定] 2026-07-25 オーナーレビュー）。 */}
                <ol className={s.reviewList} aria-label="見直しリスト">
                  {records.map((r, i) => (
                    <li key={i} className={`${s.reviewRow} ${r.ok ? s.rowOk : s.rowNg}`}>
                      {/* 1行目=番号＋○×のヘッダ。問題は回答・正解と同じ「ラベル＋牌列」の行にする。 */}
                      <span className={s.reviewNo}>
                        {i + 1}
                        <span className={`${s.reviewMark} ${r.ok ? s.ok : s.ng}`}>
                          {r.ok ? "○" : "×"}
                        </span>
                      </span>
                      <span className={s.reviewAnswer}>
                        <span className={s.reviewLabel}>問題</span>
                        <span role="group" aria-label="問題" className={s.reviewTiles}>
                          {r.question.tiles.map((t, j) => (
                            <span key={j} className={s.reviewTile}>
                              <OssTileFace code={t} />
                            </span>
                          ))}
                        </span>
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
                      {r.question.kind === "efficiency" && (
                        <UkeireDetail tiles={r.question.tiles} picked={r.picked[0] ?? null} />
                      )}
                    </li>
                  ))}
                </ol>
              </div>
            )}
            {sendError && (
              <p className={s.sendError}>結果の送信に失敗しました。この挑戦は記録に残りません。</p>
            )}
            {/* 「もう一度挑戦」の再開始が拒否されたとき（402 等）は結果画面の上に表示する。 */}
            {errorMsg && (
              <p className={s.error} role="alert">
                {errorMsg}
              </p>
            )}
            {errorMsg === QUIZ_LIMIT_MESSAGE && (
              <Link href="/settings" className={s.upgrade}>
                プランをアップグレード
              </Link>
            )}
            <div className={s.resultActions}>
              {/* 主=同じ種目で即もう1回（開始 API を呼ぶ=1回消費）／副=種目選択へ戻る。 */}
              <button
                type="button"
                className={s.retry}
                disabled={starting}
                onClick={() => void start(kind)}
              >
                もう一度挑戦
              </button>
              <button
                type="button"
                className={s.back}
                onClick={() => {
                  // 「もう一度挑戦」失敗（402等）のエラーを選択画面へ持ち越さない
                  //（上限はプランカードで伝える方針）。
                  setErrorMsg(null);
                  setPhase("select");
                }}
              >
                問題選択にもどる
              </button>
            </div>
          </section>
        ) : (
          <section>
            <div className={s.hud}>
              <span className={s.hudKind}>{QUIZ_KIND_LABELS[kind]}</span>
              <span className={s.hudScore}>
                正解 {correct} / {total}問
              </span>
              {/* 残り秒が主役。残り10秒未満は赤系に変えて焦りを可視化する。 */}
              <span className={`${s.hudTime} ${secondsLeft < 10 ? s.hudTimeLow : ""}`}>
                残り {secondsLeft}秒
              </span>
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
            {/* フィードバック帯: 出題パネル直下の固定スロット（高さ固定でレイアウトシフトなし・
                牌やボタンに被せない。中央オーバーレイは廃止 [決定] 2026-07-25 オーナーレビュー）。
                回答直後だけ 正解=緑系（--em-light 系）/不正解=赤系（#d10f3a 系）に塗って
                最短文言を出し、0.5秒後に次問と同時に空へ戻る。 */}
            <div
              role="status"
              className={`${s.feedbackBand} ${
                feedback === "ok" ? s.bandOk : feedback === "ng" ? s.bandNg : ""
              }`}
            >
              {feedback === "ok" ? "○ 正解" : feedback === "ng" ? "× 不正解" : ""}
            </div>
          </section>
        )}
      </main>
    </div>
  );
}

/**
 * 牌効率の見直し行に出す受け入れ詳細。結果画面の描画時に discardUkeires を計算する
 * （60秒セッション中の負荷を増やさない）。計算は重い（14枚×34種の向聴総当たり）ので
 * useMemo で手牌が変わらない再レンダーでは再計算しない。あなたの回答が最小向聴を
 * 保っていなければ「向聴戻し」バッジを添え、正解（bestUkeires=EfficiencyQuestion.answer
 * と同じ集合・同じ順序）は各打牌の受け入れを1行ずつ並べる。
 */
function UkeireDetail({ tiles, picked }: { tiles: readonly Tile[]; picked: Tile | null }) {
  const ukeires = useMemo(() => discardUkeires(tiles), [tiles]);
  const minShanten = ukeires[0]?.shanten;
  const mine = ukeires.find((u) => u.discard === picked);
  // 正解集合の判定は @rigel/ui の bestUkeires に一元化（ここで再実装しない）。
  const best = bestUkeires(ukeires);
  return (
    <span className={s.ukeireDetail}>
      {mine && (
        <span className={s.ukeireLine}>
          <span role="group" aria-label="あなたの回答の受け入れ" className={s.ukeireBody}>
            {mine.shanten !== minShanten && <span className={s.regress}>向聴戻し</span>}
            <span className={s.ukeireCount}>
              受け入れ {mine.tiles.length}種{mine.count}枚
            </span>
            <span className={s.reviewTiles}>
              {mine.tiles.map((t, j) => (
                <span key={j} className={s.reviewTile}>
                  <OssTileFace code={t} />
                </span>
              ))}
            </span>
          </span>
        </span>
      )}
      {best.map((u) => (
        <span key={u.discard} className={s.ukeireLine}>
          <span className={s.reviewTile}>
            <OssTileFace code={u.discard} />
          </span>
          <span className={s.ukeireArrow}>→</span>
          <span
            role="group"
            aria-label={`正解${tileLabel(u.discard)}の受け入れ`}
            className={s.ukeireBody}
          >
            <span className={s.ukeireCount}>
              受け入れ {u.tiles.length}種{u.count}枚
            </span>
            <span className={s.reviewTiles}>
              {u.tiles.map((t, j) => (
                <span key={j} className={s.reviewTile}>
                  <OssTileFace code={t} />
                </span>
              ))}
            </span>
          </span>
        </span>
      ))}
    </span>
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
  // 回答直後（採点表示中）は操作を無効化する。正誤の表示自体はパネル直下の
  // フィードバック帯（TrainingScreen 側）が担い、ここでは牌・ボタンに何も被せない。
  const grading = feedback !== null;

  if (question.kind === "chinitsu") {
    // 候補は出題スート（単色）の1〜9。回答後も正答は見せない（○×のみ。見直しは結果画面）。
    const suit = question.tiles[0]![1]!;
    const candidates = Array.from({ length: 9 }, (_, i) => `${i + 1}${suit}` as Tile);
    return (
      <div className={s.panel}>
        <p className={s.question}>{QUIZ_KIND_PROMPTS.chinitsu}</p>
        {/* 牌は白地カードに載せず暗い背景へ直接・中央揃え（[決定] 2026-07-25 オーナーレビュー）。 */}
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
        </div>
      </div>
    );
  }

  return (
    <div className={s.panel}>
      <p className={s.question}>{QUIZ_KIND_PROMPTS.efficiency}</p>
      {/* 牌は白地カードに載せず暗い背景へ直接・中央揃え（[決定] 2026-07-25 オーナーレビュー）。 */}
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
    </div>
  );
}
