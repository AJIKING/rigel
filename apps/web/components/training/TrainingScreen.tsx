"use client";

import type { QuizSessionDto } from "@rigel/client";
import type { QuizKind, Tile } from "@rigel/schema";
import {
  ANALYTICS_EVENTS,
  createQuizRng,
  createQuizSession,
  defaultQuizQuestion,
  chinitsuWaitCandidates,
  quizFinishPayload,
  quizRecentLine,
  quizSessionReducer,
  scoreDisplayTiles,
  scoreMeldViews,
  tileLabel,
  QUIZ_CARD_MOTIF,
  QUIZ_COUNTDOWN_SECONDS,
  QUIZ_EMPTY_HISTORY_MESSAGE,
  QUIZ_FEEDBACK_MS,
  QUIZ_KIND_DESCRIPTIONS,
  QUIZ_KIND_LABELS,
  QUIZ_KIND_PROMPTS,
  QUIZ_KINDS,
  QUIZ_LIMIT_MESSAGE,
  QUIZ_RECENT_LIMIT,
  QUIZ_RANKING_LINK_LABEL,
  QUIZ_RULE_NOTE,
  QUIZ_SEND_ERROR_MESSAGE,
  QUIZ_SIGNIN_NOTE,
  QUIZ_SESSION_SECONDS,
  QUIZ_START_ERROR_MESSAGE,
  type QuizQuestion,
  type QuizSessionContext,
  type QuizSessionEvent,
} from "@rigel/ui";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  finishQuizSessionAction,
  listQuizSessionsAction,
  startQuizSessionAction,
} from "../../app/actions";
import { trackEvent } from "../../lib/analytics";
import type { AuthUser } from "../../lib/api";
import { useAuth } from "../../lib/auth-context";
import { AppHeader } from "../AppHeader";
import { OssTileFace } from "../OssTileFace";
import { QuizReviewList } from "./QuizReviewList";
import s from "./training.module.css";

/**
 * 特訓画面（/training)。60秒タイムアタックで点数計算・牌効率・清一色（何待ち／牌効率）を反復する。
 * セッションの状態遷移（ダイアログ→開始→3,2,1→出題→回答→○×→時間切れ→結果→retry/back）は
 * web/mobile 共有の状態機械（@rigel/ui quiz-session-machine）に一元化し、この画面は
 * 「イベントを dispatch して state を描画する」だけ。API 呼び出し・タイマー駆動・analytics は
 * この画面の副作用として残す（無料の回数制限は開始 API がサーバ強制。
 * Plan: docs/plans/quiz-training.md）。
 * 未サインインでも遊べる（匿名プレイ）: 出題・採点は完全クライアントなので API を一切呼ばず、
 * sessionId=null の匿名セッションとして状態機械を回す。結果は保存されない（結果画面に
 * サインイン導線だけ出す。Plan: docs/plans/quiz-open-and-ranking.md Phase 1）。
 * seed はテスト・dev プレビューで出題列を固定する注入口（未指定は Date.now()）。
 * generateQuestion はテストが出題オブジェクトを直接注入する注入口（既定は
 * defaultQuizQuestion=本物の生成器。出題内容の正しさは @rigel/ui のテストが担保）。
 * user / startSession / finishSession / listSessions / sessionSeconds / countdownSeconds は
 * /dev/training（API・ログイン不要のプレビュー）とテスト用の注入口。
 */
export function TrainingScreen({
  seed,
  sessionSeconds = QUIZ_SESSION_SECONDS,
  countdownSeconds = QUIZ_COUNTDOWN_SECONDS,
  generateQuestion,
  user: userOverride,
  startSession = startQuizSessionAction,
  finishSession = finishQuizSessionAction,
  listSessions = listQuizSessionsAction,
}: {
  seed?: number;
  /** 1回の挑戦の秒数（dev プレビューで短縮する注入口。既定は QUIZ_SESSION_SECONDS=60）。 */
  sessionSeconds?: number;
  /** 開始カウントダウンの秒数（dev の phase ショートカットが 0 で飛ばす注入口。既定は 3）。 */
  countdownSeconds?: number;
  /** 出題生成の注入口（テストが固定出題を差す。既定は本物の生成器）。 */
  generateQuestion?: (kind: QuizKind, rng: () => number) => QuizQuestion;
  /** 認証ユーザーの上書き（undefined なら useAuth の実状態。null は未ログイン表示）。 */
  user?: AuthUser | null;
  startSession?: typeof startQuizSessionAction;
  finishSession?: typeof finishQuizSessionAction;
  listSessions?: typeof listQuizSessionsAction;
}) {
  const auth = useAuth();
  const user = userOverride === undefined ? auth.user : userOverride;
  const loading = userOverride === undefined ? auth.loading : false;

  // --- セッション状態は共有状態機械に一元化。dispatch は「今の state から次の state を
  // その場で計算して置き換える」（updater 関数を使わない）＝rng の消費が二重実行されない。
  const [state, setState] = useState(() => createQuizSession({ sessionSeconds, countdownSeconds }));
  const stateRef = useRef(state);
  const rngRef = useRef<() => number>(() => 0);
  const genRef = useRef(generateQuestion);
  genRef.current = generateQuestion;
  const dispatch = useCallback((event: QuizSessionEvent) => {
    const ctx: QuizSessionContext = {
      nextQuestion: (k) => (genRef.current ?? defaultQuizQuestion)(k, rngRef.current),
    };
    stateRef.current = quizSessionReducer(stateRef.current, event, ctx);
    setState(stateRef.current);
  }, []);

  // --- 画面ローカルの IO 状態（API の成否・読み込み中表示のみ。遷移は機械が持つ）。
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  /** ダイアログに出す直近5回の記録（null=読込中）。対象種目のみ。 */
  const [recent, setRecent] = useState<readonly QuizSessionDto[] | null>(null);
  /** ダイアログ内の開始エラー（402=上限メッセージ等。ダイアログを開いたまま出す）。 */
  const [dialogError, setDialogError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  /** 結果送信の失敗（結果画面は出したままエラーを小さく表示）。 */
  const [sendError, setSendError] = useState(false);
  /** 開いているダイアログの種目（直近記録の取得が閉/開き直しと競合しないための同期値）。 */
  const pendingKindRef = useRef<QuizKind | null>(null);

  // 開始カウントダウン（3→2→1 の各1秒）。この間 60 秒タイマーは動かさない
  // （TIMER_TICK は countdown 中は機械が無視する）。
  useEffect(() => {
    if (state.phase !== "countdown") return;
    const id = setInterval(() => dispatch({ type: "COUNTDOWN_TICK", now: Date.now() }), 1000);
    return () => clearInterval(id);
  }, [state.phase, dispatch]);

  // 60秒タイマー（セッション中のみ）。残り秒は機械が deadline と now から計算する
  // （実時刻基準。interval のドリフトが結果に混入しない）。
  useEffect(() => {
    if (state.phase !== "running") return;
    const id = setInterval(() => dispatch({ type: "TIMER_TICK", now: Date.now() }), 1000);
    return () => clearInterval(id);
  }, [state.phase, dispatch]);

  // ○×の 0.5 秒表示 → 次問（時間切れで phase が変わればクリーンアップで破棄）。
  useEffect(() => {
    if (state.phase !== "running" || state.feedback === null) return;
    const id = setTimeout(() => dispatch({ type: "FEEDBACK_DONE" }), QUIZ_FEEDBACK_MS);
    return () => clearTimeout(id);
  }, [state.phase, state.feedback, state.total, dispatch]);

  // 時間切れ→結果画面への遷移時に一度だけ、結果をサーバに記録して quiz_complete を送る。
  // 送信結果の適用は sessionId 一致ガード: 前セッションの遅延失敗が「もう一度挑戦」後の
  // 新しいセッションの画面を汚さない。durationMs は quizFinishPayload()（実測 clamp 済み）に一本化。
  const prevPhaseRef = useRef(state.phase);
  useEffect(() => {
    const prev = prevPhaseRef.current;
    prevPhaseRef.current = state.phase;
    if (state.phase !== "result" || prev === "result") return;
    const done = stateRef.current;
    trackEvent(ANALYTICS_EVENTS.quizComplete, { kind: done.kind });
    const sessionId = done.sessionId;
    if (!sessionId) return;
    const failed = () => {
      if (stateRef.current.sessionId === sessionId) setSendError(true);
    };
    // 結果＋全回答＋エンジン版数の組み立ては quizFinishPayload に一本化（手組みすると
    // answers の送り忘れ=静かな unverified 化が起きる。サーバはシードから再生成・再採点して
    // 確定する。Plan: docs/plans/quiz-open-and-ranking.md Phase 4）。
    finishSession(sessionId, quizFinishPayload(done))
      .then((r) => {
        if (!r.ok) failed();
      })
      .catch(failed);
  }, [state.phase, finishSession]);

  /** 種目カードのタップ: 開始ダイアログを開く（開始 API は呼ばない＝枠を消費しない）。
   *  直近5回の記録（その種目のみ）を取得して出す。失敗しても空扱いで開始は妨げない。 */
  function openStartDialog(k: QuizKind) {
    pendingKindRef.current = k;
    dispatch({ type: "OPEN_DIALOG", kind: k });
    setDialogError(null);
    if (!user) return; // 匿名は記録が存在しない（ダイアログに出さない・取得 API も呼ばない）
    setRecent(null);
    listSessions()
      .then((all) => {
        if (pendingKindRef.current !== k) return; // 閉じた/別種目に開き直した後の応答は捨てる
        setRecent(all.filter((x) => x.kind === k).slice(0, QUIZ_RECENT_LIMIT));
      })
      .catch(() => {
        if (pendingKindRef.current === k) setRecent([]);
      });
  }

  function closeStartDialog() {
    pendingKindRef.current = null;
    dispatch({ type: "CLOSE_DIALOG" });
    setDialogError(null);
  }

  /** セッション開始の共通処理。成功なら quiz_start を送り START/RETRY を dispatch して null、
   *  失敗なら表示すべきエラーメッセージを返す（表示先は呼び出し側: ダイアログ内/結果画面）。 */
  async function start(k: QuizKind, isRetry: boolean): Promise<string | null> {
    setStarting(true);
    try {
      // 匿名（未サインイン）は開始 API を呼ばない＝枠の概念がなく、結果も保存しない。
      let sessionId: string | null = null;
      let serverSeed: number | null = null;
      if (user) {
        const res = await startSession(k).catch(() => ({ ok: false as const, status: 0 }));
        if (!res.ok) {
          return res.status === 402 ? QUIZ_LIMIT_MESSAGE : QUIZ_START_ERROR_MESSAGE;
        }
        sessionId = res.id;
        serverSeed = res.seed;
      }
      setErrorMsg(null);
      setSendError(false);
      // 残り回数（res.remainingToday）は表示しない（[決定] 2026-07-25 オーナーレビュー。
      // 上限は 402 時の文言とプランカードで伝える）。
      // 出題はシード付きの決定的生成。サインイン時は**サーバ発行シード**を使う（完了時に
      // サーバが同じシードで再生成・再採点する）。注入 seed（テスト/dev）が最優先・匿名は実時刻。
      rngRef.current = createQuizRng(seed ?? serverSeed ?? Date.now());
      trackEvent(ANALYTICS_EVENTS.quizStart, { kind: k });
      const now = Date.now();
      dispatch(
        isRetry ? { type: "RETRY", sessionId, now } : { type: "START", kind: k, sessionId, now },
      );
      return null;
    } finally {
      setStarting(false);
    }
  }

  /** ダイアログの「開始」: ここで初めて枠を消費する。402 等はダイアログ内に出して開始しない。 */
  async function startFromDialog() {
    const k = stateRef.current.pendingKind;
    if (k === null || starting) return;
    const msg = await start(k, false);
    if (msg) setDialogError(msg);
    else {
      // 開始成功: ダイアログは機械（START）が閉じている。ローカルの取得ガードだけ畳む。
      pendingKindRef.current = null;
      setDialogError(null);
    }
  }

  /** 結果画面の「もう一度挑戦」: 同じ種目で再度開始（1回消費）。拒否は結果画面の上に出す。 */
  async function retry() {
    if (starting) return;
    const msg = await start(stateRef.current.kind, true);
    if (msg) setErrorMsg(msg);
  }

  const { phase, kind, pendingKind, countdown, secondsLeft, total, correct, question, picked, feedback, records } = state; // prettier-ignore

  return (
    <div className={`${s.shell} themeApp`}>
      <AppHeader active="training" />
      <main className={s.main}>
        <div className={s.head}>
          <h1>特訓</h1>
          {/* ランキング導線（mobile の特訓タブと同配置。ヘッダのナビにもあるが、
              特訓画面からの発見性を上げる。2026-08-04 UXレビュー）。 */}
          <Link href="/ranking" className={s.rankingLink}>
            {QUIZ_RANKING_LINK_LABEL}
          </Link>
        </div>

        {loading ? (
          // 認証確認中に真っ白にしない（他画面と同じ控えめな文言。role=status で支援技術にも伝える）。
          <p className={s.loginNote} role="status">
            読み込み中…
          </p>
        ) : phase === "select" ? (
          <section>
            <div className={s.cards}>
              {QUIZ_KINDS.map((k) => (
                <button
                  key={k}
                  type="button"
                  className={s.card}
                  disabled={starting}
                  onClick={() => openStartDialog(k)}
                >
                  <span className={s.cardFan} aria-hidden="true">
                    {QUIZ_CARD_MOTIF[k].map((t, i) => (
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
            {/* 開始ダイアログ: 種目名＋説明＋直近5回の記録＋開始/もどる（RulesDialog と同じ
                overlay+role=dialog 流儀）。枠の消費は「開始」を押した瞬間だけ。402 等の開始
                エラーはダイアログ内に出す（アップグレード導線つき）。 */}
            {pendingKind !== null && (
              <div className={s.overlay} onClick={closeStartDialog}>
                <div
                  className={s.dialog}
                  role="dialog"
                  aria-modal="true"
                  aria-label={`${QUIZ_KIND_LABELS[pendingKind]}を開始`}
                  onClick={(e) => e.stopPropagation()}
                >
                  <h2 className={s.dlgTitle}>{QUIZ_KIND_LABELS[pendingKind]}</h2>
                  <p className={s.dlgDesc}>{QUIZ_KIND_DESCRIPTIONS[pendingKind]}</p>
                  {/* ルール一文（[決定] 2026-07-26）: 種目名/説明の近くに1文だけ。 */}
                  <p className={s.dlgRule}>{QUIZ_RULE_NOTE}</p>
                  {/* 直近の記録はサインイン時のみ（匿名は記録が存在しない＝空文言も出さない）。 */}
                  {user && (
                    <>
                      <p className={s.dlgRecentTitle}>直近の記録</p>
                      {recent === null ? (
                        <p className={s.dlgEmpty}>読み込み中…</p>
                      ) : recent.length === 0 ? (
                        <p className={s.dlgEmpty}>{QUIZ_EMPTY_HISTORY_MESSAGE}</p>
                      ) : (
                        <ul className={s.dlgRecent} aria-label="直近の記録">
                          {recent.map((x) => (
                            <li key={x.id}>{quizRecentLine(x)}</li>
                          ))}
                        </ul>
                      )}
                    </>
                  )}
                  {dialogError && (
                    <p className={s.error} role="alert">
                      {dialogError}
                    </p>
                  )}
                  {dialogError === QUIZ_LIMIT_MESSAGE && (
                    <Link href="/settings" className={s.upgrade}>
                      プランをアップグレード
                    </Link>
                  )}
                  <div className={s.dlgActions}>
                    <button
                      type="button"
                      className={s.retry}
                      disabled={starting}
                      onClick={() => void startFromDialog()}
                    >
                      開始
                    </button>
                    <button type="button" className={s.back} onClick={closeStartDialog}>
                      もどる
                    </button>
                  </div>
                </div>
              </div>
            )}
          </section>
        ) : phase === "countdown" ? (
          // 開始カウントダウン: 出題エリアに大きく 3→2→1（牌・HUD・60秒タイマーは出さない）。
          <section>
            <div className={s.panel}>
              <p className={s.countdown} role="status">
                {countdown}
              </p>
            </div>
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
                （セッション中は正答を見せないぶんここで確認する。表示はマイページの
                セッション詳細と共有=QuizReviewList）。 */}
            <QuizReviewList records={records} />
            {/* 成績直後はランキングへの動機づけが最も高い瞬間（2026-08-04 UXレビュー）。 */}
            <p className={s.loginNote}>
              <Link href="/ranking">{QUIZ_RANKING_LINK_LABEL}</Link>
            </p>
            {/* 匿名セッションは保存されない: サインインの動機づけ導線を1行だけ出す。 */}
            {!user && (
              <p className={s.loginNote}>
                <Link href="/login">{QUIZ_SIGNIN_NOTE}</Link>
              </p>
            )}
            {sendError && <p className={s.sendError}>{QUIZ_SEND_ERROR_MESSAGE}</p>}
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
                onClick={() => void retry()}
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
                  dispatch({ type: "BACK_TO_SELECT" });
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
                onToggleWait={(tile) => dispatch({ type: "TOGGLE_WAIT", tile })}
                onSubmitChinitsu={() => dispatch({ type: "SUBMIT_CHINITSU" })}
                onDiscard={(tile) => dispatch({ type: "DISCARD", tile })}
                onChooseScore={(choice) => dispatch({ type: "CHOOSE_SCORE", choice })}
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

/** 出題エリア（清一色 何待ち=待ち牌の複数選択 / 牌効率系=切る牌のタップ / 点数計算=4択）。 */
function QuestionPanel({
  question,
  picked,
  feedback,
  onToggleWait,
  onSubmitChinitsu,
  onDiscard,
  onChooseScore,
}: {
  question: QuizQuestion;
  picked: readonly Tile[];
  feedback: "ok" | "ng" | null;
  onToggleWait: (tile: Tile) => void;
  onSubmitChinitsu: () => void;
  onDiscard: (tile: Tile) => void;
  onChooseScore: (choice: string) => void;
}) {
  // 回答直後（採点表示中）は操作を無効化する。正誤の表示自体はパネル直下の
  // フィードバック帯（TrainingScreen 側）が担い、ここでは牌・ボタンに何も被せない。
  const grading = feedback !== null;

  if (question.kind === "score") {
    // 点数計算: 条件（親子・自風・ツモロン・場風）＋ドラ表示牌＋牌姿（手牌+副露+和了牌）を見て
    // 点数を4択で選ぶ。翻数・符は表示しない（自分で数えるのが問題）。副露の表示は盤面と同じ
    // 共有ルール（scoreMeldViews→meldTileViews: 暗槓=両端裏・ポン/カン/チー=鳴き元の位置を横向き）。
    return (
      <div className={s.panel}>
        <p className={s.question}>{QUIZ_KIND_PROMPTS.score}</p>
        <p className={s.scoreCond}>{question.label}</p>
        <div className={s.doraRow}>
          <span className={s.doraLabel}>ドラ表示牌</span>
          <span role="group" aria-label="ドラ表示牌" className={s.hand}>
            {question.doraIndicators.map((t, i) => (
              <span key={i} className={s.tile}>
                <OssTileFace code={t} />
              </span>
            ))}
          </span>
        </div>
        <div className={s.scoreHand}>
          <span role="group" aria-label="手牌" className={s.hand}>
            {scoreDisplayTiles(question).map((t, i) => (
              <span key={i} className={s.tile}>
                <OssTileFace code={t} />
              </span>
            ))}
          </span>
          {question.melds.map((m, mi) => (
            // data-meld / data-tile はレイアウト検証（Playwright）用の安定セレクタ
            // （CSS Module クラスはハッシュ化されるため、牌の矩形を測るフックにする）。
            <span key={mi} role="group" aria-label="副露" className={s.meld} data-meld="">
              {scoreMeldViews(m, question.seatWind).map((v, j) =>
                v.back ? (
                  <span key={j} className={`${s.tile} ${s.tileBack}`} data-tile="meld" />
                ) : (
                  <span key={j} className={`${s.tile} ${v.lay ? s.tileLay : ""}`} data-tile="meld">
                    <OssTileFace code={v.tile} />
                  </span>
                ),
              )}
            </span>
          ))}
          <span role="group" aria-label="上がり牌" className={`${s.hand} ${s.winSlot}`}>
            <span className={`${s.tile} ${s.winTile}`}>
              <OssTileFace code={question.winTile} />
            </span>
            <span className={s.winBadge}>{question.tsumo ? "ツモ" : "ロン"}</span>
          </span>
        </div>
        <div className={s.choices2}>
          {question.choices.map((c) => (
            <button
              key={c}
              type="button"
              className={s.choice}
              disabled={grading}
              onClick={() => onChooseScore(c)}
            >
              {c}
            </button>
          ))}
        </div>
      </div>
    );
  }

  if (question.kind === "chinitsu") {
    // 候補は出題スート（単色）の1〜9（共有の chinitsuWaitCandidates=物差しは1つ）。
    // 回答後も正答は見せない（○×のみ。見直しは結果画面）。
    const candidates = chinitsuWaitCandidates(question);
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
      <p className={s.question}>{QUIZ_KIND_PROMPTS[question.kind]}</p>
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
