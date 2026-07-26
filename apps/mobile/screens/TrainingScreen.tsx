import type { QuizSessionDto } from "@rigel/client";
import type { QuizKind, Tile } from "@rigel/schema";
import {
  ANALYTICS_EVENTS,
  createQuizRng,
  createQuizSession,
  defaultQuizQuestion,
  quizRecentLine,
  quizSessionReducer,
  scoreDisplayTiles,
  scoreMeldViews,
  scoreYakuLine,
  sessionResult,
  tileLabel,
  ukeireReviewModel,
  QUIZ_CARD_MOTIF,
  QUIZ_FEEDBACK_MS,
  QUIZ_KIND_DESCRIPTIONS,
  QUIZ_KIND_LABELS,
  QUIZ_KIND_PROMPTS,
  QUIZ_KINDS,
  QUIZ_LIMIT_MESSAGE,
  QUIZ_RECENT_LIMIT,
  QUIZ_RULE_NOTE,
  QUIZ_SEND_ERROR_MESSAGE,
  QUIZ_START_ERROR_MESSAGE,
  QUIZ_EMPTY_HISTORY_MESSAGE,
  type QuizQuestion,
  type QuizSessionContext,
  type QuizSessionEvent,
} from "@rigel/ui";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { BottomSheet } from "../components/BottomSheet";
import { CenterState } from "../components/CenterState";
import { MiniTile } from "../components/MiniTile";
import { trackEvent } from "../lib/analytics";
import { finishQuizSession, listQuizSessions, startQuizSession } from "../lib/api";
import { useAuth } from "../lib/auth";
import { colors, radius } from "../lib/theme";

/** 再ログイン促し（token 失効時。mobile 固有の文言）。 */
const RELOGIN_MESSAGE = "ログインが必要です。再度ログインしてください。";

/**
 * 特訓画面（特訓タブ）。60秒タイムアタックで清一色多面待ち・牌効率・点数計算を反復する。
 * セッションの状態遷移（ダイアログ→開始→3,2,1→出題→回答→○×→時間切れ→結果→retry/back）は
 * web と共有の状態機械（@rigel/ui quiz-session-machine）に一元化し、この画面は
 * 「イベントを dispatch して state を描画する」だけ。API 呼び出し・タイマー駆動・analytics は
 * この画面の副作用として残す（回数制限=無料1日3回は開始 API がサーバ強制。
 * Plan: docs/plans/quiz-training.md）。
 * seed はテスト用に出題列を固定する注入口（未指定は Date.now()）。
 * generateQuestion はテストが出題オブジェクトを直接注入する注入口（既定は
 * defaultQuizQuestion=本物の生成器。出題内容の正しさは @rigel/ui のテストが担保）。
 * onOpenSettings は無料枠使い切り（402）時のアップグレード導線
 * （プラン変更 UI のある設定タブへ。HomeTabs が配線）。
 */
export function TrainingScreen({
  seed,
  generateQuestion,
  onOpenSettings,
}: {
  seed?: number;
  /** 出題生成の注入口（テストが固定出題を差す。既定は本物の生成器）。 */
  generateQuestion?: (kind: QuizKind, rng: () => number) => QuizQuestion;
  onOpenSettings?: () => void;
}) {
  const { user, token, loading } = useAuth();

  // --- セッション状態は共有状態機械に一元化。dispatch は「今の state から次の state を
  // その場で計算して置き換える」（updater 関数を使わない）＝rng の消費が二重実行されない。
  const [state, setState] = useState(() => createQuizSession());
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
  // 新しいセッションの画面を汚さない。durationMs は sessionResult()（実測 clamp 済み）に一本化。
  const prevPhaseRef = useRef(state.phase);
  useEffect(() => {
    const prev = prevPhaseRef.current;
    prevPhaseRef.current = state.phase;
    if (state.phase !== "result" || prev === "result") return;
    const done = stateRef.current;
    void trackEvent(ANALYTICS_EVENTS.quizComplete, { kind: done.kind });
    const sessionId = done.sessionId;
    if (!sessionId || !token) return;
    const failed = () => {
      if (stateRef.current.sessionId === sessionId) setSendError(true);
    };
    finishQuizSession(token, sessionId, sessionResult(done))
      .then((r) => {
        if (!r.ok) failed();
      })
      .catch(failed);
  }, [state.phase, token]);

  /** 種目カードのタップ: 開始ダイアログを開く（開始 API は呼ばない＝枠を消費しない）。
   *  直近5回の記録（その種目のみ）を取得して出す。失敗しても空扱いで開始は妨げない。 */
  function openStartDialog(k: QuizKind) {
    // token 失効（user はいるが token が無い）で沈黙しない。再ログインを促す。
    if (!token) {
      setErrorMsg(RELOGIN_MESSAGE);
      return;
    }
    setErrorMsg(null);
    pendingKindRef.current = k;
    dispatch({ type: "OPEN_DIALOG", kind: k });
    setDialogError(null);
    setRecent(null);
    listQuizSessions(token)
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
    // token 失効で沈黙しない（ダイアログは token 必須で開くが、セッション中の失効に備える）。
    if (!token) return RELOGIN_MESSAGE;
    setStarting(true);
    try {
      const res = await startQuizSession(token, k).catch(() => ({
        ok: false as const,
        status: 0,
      }));
      if (!res.ok) {
        return res.status === 402 ? QUIZ_LIMIT_MESSAGE : QUIZ_START_ERROR_MESSAGE;
      }
      setErrorMsg(null);
      setSendError(false);
      // 残り回数（res.remainingToday）は表示しない（[決定] 2026-07-25 オーナーレビュー。
      // 上限は 402 時の文言とプランカードで伝える）。
      // 出題はシード付きの決定的生成（テストは seed か generateQuestion の注入で固定できる）。
      rngRef.current = createQuizRng(seed ?? Date.now());
      void trackEvent(ANALYTICS_EVENTS.quizStart, { kind: k });
      const now = Date.now();
      dispatch(
        isRetry
          ? { type: "RETRY", sessionId: res.id, now }
          : { type: "START", kind: k, sessionId: res.id, now },
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

  /** 回答イベント（ガードは機械が持つ。○×表示中の再回答等は reducer が無視する）。 */
  const toggleWait = (tile: Tile) => dispatch({ type: "TOGGLE_WAIT", tile });
  const submitChinitsu = () => dispatch({ type: "SUBMIT_CHINITSU" });
  const discardTile = (tile: Tile) => dispatch({ type: "DISCARD", tile });
  const chooseScore = (choice: string) => dispatch({ type: "CHOOSE_SCORE", choice });

  // 認証確認中はログイン導線をフラッシュさせない（文言は web と同じ「読み込み中…」）。
  if (loading) return <CenterState message="読み込み中…" />;
  // アプリはログイン必須（App がゲート）だが、画面単体でも防御的にログイン導線を出す。
  if (!user) return <CenterState message="特訓するにはログインしてください。" />;

  return (
    <View style={styles.flex}>
      <ScrollView style={styles.root} contentContainerStyle={styles.body}>
        <Text style={styles.title}>特訓</Text>

        {phase === "select" ? (
          <View style={styles.section}>
            {QUIZ_KINDS.map((k) => (
              <Pressable
                key={k}
                style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
                disabled={starting}
                onPress={() => openStartDialog(k)}
                accessibilityRole="button"
              >
                <View
                  style={styles.cardFan}
                  importantForAccessibility="no-hide-descendants"
                  accessibilityElementsHidden
                >
                  {QUIZ_CARD_MOTIF[k].map((t, j) => (
                    <View
                      key={j}
                      style={[styles.fanTile, j === 0 && styles.fanL, j === 2 && styles.fanR]}
                    >
                      <MiniTile code={t} w={30} h={41} />
                    </View>
                  ))}
                </View>
                <Text style={styles.cardTitle}>{QUIZ_KIND_LABELS[k]}</Text>
                <Text style={styles.cardDesc}>{QUIZ_KIND_DESCRIPTIONS[k]}</Text>
              </Pressable>
            ))}
            {/* token 失効時の再ログイン促し（開始エラーはダイアログ内に出す）。 */}
            {errorMsg ? (
              <Text style={styles.error} accessibilityRole="alert">
                {errorMsg}
              </Text>
            ) : null}
          </View>
        ) : phase === "countdown" ? (
          // 開始カウントダウン: 出題エリアに大きく 3→2→1（牌・HUD・60秒タイマーは出さない）。
          <View style={styles.panel}>
            <Text style={styles.countdown} testID="countdown" accessibilityLiveRegion="polite">
              {countdown}
            </Text>
          </View>
        ) : phase === "result" ? (
          <View style={styles.resultBox}>
            <Text style={styles.resultHead}>結果</Text>
            <Text style={styles.resultLine}>{QUIZ_KIND_LABELS[kind]}</Text>
            {/* スコアは stat カード横並び（正解数・出題数・正答率）。60秒固定なので
              「1分あたり」は出さない（正解/出題と意味が重複するため）。 */}
            <View style={styles.stats}>
              <Text style={styles.stat}>正解 {correct}問</Text>
              <Text style={styles.stat}>出題 {total}問</Text>
              <Text style={styles.stat}>
                正答率 {total > 0 ? Math.round((correct / total) * 100) : 0}%
              </Text>
            </View>
            {/* 見直しリスト: 回答した問題だけを○×・手牌・あなたの回答・正解つきで振り返る
              （セッション中は正答を見せないぶんここで確認する。サーバには送らない）。 */}
            {records.length > 0 ? (
              <View style={styles.review}>
                {/* 見出しテキストは置かずリストを直接置く（[決定] 2026-07-25 オーナーレビュー）。 */}
                {records.map((r, i) => {
                  const q = r.question;
                  return (
                    <View
                      key={i}
                      style={[styles.reviewRow, r.ok ? styles.rowOk : styles.rowNg]}
                      testID={`review-row-${i + 1}`}
                    >
                      {/* 1行目=番号＋○×のヘッダ。問題は回答・正解と同じ「ラベル＋牌列」の行にする。 */}
                      <Text style={styles.reviewNo}>
                        {i + 1}{" "}
                        <Text style={[styles.reviewMark, r.ok ? styles.ok : styles.ng]}>
                          {r.ok ? "○" : "×"}
                        </Text>
                      </Text>
                      {q.kind === "score" ? (
                        // 点数計算: 条件＋ドラ表示＋牌姿（手牌+副露+和了牌）に、回答/正解の
                        // テキスト行と役の内訳（＝見直しで数え方まで学べる）。
                        <>
                          <View style={styles.reviewLine}>
                            <Text style={styles.reviewLabel}>問題</Text>
                            <Text style={styles.reviewText}>{q.label}</Text>
                          </View>
                          <View style={styles.reviewLine} testID={`review-dora-${i + 1}`}>
                            <Text style={styles.reviewLabel}>ドラ表示</Text>
                            <View style={styles.reviewTiles}>
                              {q.doraIndicators.map((t, j) => (
                                <MiniTile key={j} code={t} w={18} h={25} />
                              ))}
                            </View>
                          </View>
                          <View
                            style={[styles.reviewTiles, styles.reviewLineTiles]}
                            testID={`review-hand-${i + 1}`}
                          >
                            {scoreDisplayTiles(q).map((t, j) => (
                              <MiniTile key={j} code={t} w={18} h={25} />
                            ))}
                            {q.melds.map((m, mi) => (
                              <View key={`m${mi}`} style={styles.reviewMeld}>
                                {scoreMeldViews(m, q.seatWind).map((v, j) =>
                                  v.back ? (
                                    <View key={j} style={styles.reviewBack} />
                                  ) : (
                                    <View key={j} style={v.lay ? styles.lay : null}>
                                      <MiniTile code={v.tile} w={18} h={25} />
                                    </View>
                                  ),
                                )}
                              </View>
                            ))}
                            <View style={styles.winTile}>
                              <MiniTile code={q.winTile} w={18} h={25} />
                            </View>
                          </View>
                          <View style={styles.reviewLine}>
                            <Text style={styles.reviewLabel}>あなたの回答</Text>
                            <Text style={styles.reviewText}>{r.pickedChoice}</Text>
                          </View>
                          <View style={styles.reviewLine}>
                            <Text style={styles.reviewLabel}>正解</Text>
                            <Text style={styles.reviewText}>{q.answer}</Text>
                          </View>
                          <View style={styles.reviewLine}>
                            <Text style={styles.reviewLabel}>役</Text>
                            <Text style={styles.reviewText}>{scoreYakuLine(q)}</Text>
                          </View>
                        </>
                      ) : (
                        <>
                          <View style={styles.reviewLine}>
                            <Text style={styles.reviewLabel}>問題</Text>
                            <View
                              style={[styles.reviewTiles, styles.reviewLineTiles]}
                              testID={`review-hand-${i + 1}`}
                            >
                              {q.tiles.map((t, j) => (
                                <MiniTile key={j} code={t} w={18} h={25} />
                              ))}
                            </View>
                          </View>
                          <View style={styles.reviewLine}>
                            <Text style={styles.reviewLabel}>あなたの回答</Text>
                            <View style={styles.reviewTiles} testID={`review-picked-${i + 1}`}>
                              {r.picked.map((t, j) => (
                                <MiniTile key={j} code={t} w={18} h={25} />
                              ))}
                            </View>
                          </View>
                          <View style={styles.reviewLine}>
                            <Text style={styles.reviewLabel}>正解</Text>
                            <View style={styles.reviewTiles} testID={`review-answer-${i + 1}`}>
                              {q.answer.map((t, j) => (
                                <MiniTile key={j} code={t} w={18} h={25} />
                              ))}
                            </View>
                          </View>
                          {q.kind === "efficiency" ? (
                            <UkeireDetail no={i + 1} tiles={q.tiles} picked={r.picked[0] ?? null} />
                          ) : null}
                        </>
                      )}
                    </View>
                  );
                })}
              </View>
            ) : null}
            {sendError ? <Text style={styles.sendError}>{QUIZ_SEND_ERROR_MESSAGE}</Text> : null}
            {/* 「もう一度挑戦」の再開始が拒否されたとき（402 等）は結果画面の上に表示する。 */}
            {errorMsg ? (
              <Text style={styles.error} accessibilityRole="alert">
                {errorMsg}
              </Text>
            ) : null}
            {errorMsg === QUIZ_LIMIT_MESSAGE && onOpenSettings ? (
              <Pressable style={styles.upgrade} onPress={onOpenSettings} accessibilityRole="button">
                <Text style={styles.upgradeText}>プランをアップグレード</Text>
              </Pressable>
            ) : null}
            {/* 主=同じ種目で即もう1回（開始 API を呼ぶ=1回消費）／副=種目選択へ戻る。 */}
            <View style={styles.resultActions}>
              <Pressable
                style={({ pressed }) => [styles.retry, pressed && styles.pressed]}
                disabled={starting}
                onPress={() => void retry()}
                accessibilityRole="button"
              >
                <Text style={styles.retryText}>もう一度挑戦</Text>
              </Pressable>
              <Pressable
                style={({ pressed }) => [styles.backBtn, pressed && styles.pressed]}
                onPress={() => {
                  // 「もう一度挑戦」失敗（402等）のエラーを選択画面へ持ち越さない
                  //（上限はプランカードで伝える方針）。
                  setErrorMsg(null);
                  dispatch({ type: "BACK_TO_SELECT" });
                }}
                accessibilityRole="button"
              >
                <Text style={styles.backText}>問題選択にもどる</Text>
              </Pressable>
            </View>
          </View>
        ) : (
          <View style={styles.section}>
            <View style={styles.hud}>
              <Text style={styles.hudKind}>{QUIZ_KIND_LABELS[kind]}</Text>
              <Text style={styles.hudScore}>
                正解 {correct} / {total}問
              </Text>
              {/* 残り秒が主役。残り10秒未満は赤系（#d10f3a 系）に変えて焦りを可視化する。 */}
              <Text style={[styles.hudTime, secondsLeft < 10 && styles.hudTimeLow]}>
                残り {secondsLeft}秒
              </Text>
            </View>
            {question ? (
              <QuestionPanel
                question={question}
                picked={picked}
                feedback={feedback}
                onToggleWait={toggleWait}
                onSubmitChinitsu={submitChinitsu}
                onDiscard={discardTile}
                onChooseScore={chooseScore}
              />
            ) : null}
            {/* フィードバック帯: 出題パネル直下の固定高さスロット（web と同構造。中央オーバーレイは
              廃止 [決定] 2026-07-25 オーナーレビュー）。回答受付中は透明のまま高さを確保し
              （レイアウトシフトなし・牌やボタンに被せない）、回答直後だけ 正解=緑系（emLite 系）/
              不正解=赤系（#d10f3a 系）に塗って最短文言を出し、0.5秒後に次問と同時に空へ戻る。 */}
            <View
              style={[
                styles.feedbackBand,
                feedback === "ok" && styles.bandOk,
                feedback === "ng" && styles.bandNg,
              ]}
              testID="feedback-band"
              // Android のスクリーンリーダーに○×の差し込みを自動で読ませる（web の role="status" 相当。
              // iOS の announceForAccessibility は今回はスコープ外）。
              accessibilityLiveRegion="polite"
            >
              {feedback !== null ? (
                <Text style={[styles.bandText, feedback === "ok" ? styles.ok : styles.ng]}>
                  {feedback === "ok" ? "○ 正解" : "× 不正解"}
                </Text>
              ) : null}
            </View>
          </View>
        )}
      </ScrollView>

      {/* 開始ダイアログ（BottomSheet 流用）: 種目名＋説明＋直近5回の記録＋開始/もどる。
          枠の消費は「開始」を押した瞬間だけ。402 等の開始エラーはダイアログ内に出す。 */}
      {pendingKind !== null ? (
        <BottomSheet onClose={closeStartDialog}>
          <Text style={styles.dlgTitle}>{QUIZ_KIND_LABELS[pendingKind]}</Text>
          <Text style={styles.dlgDesc}>{QUIZ_KIND_DESCRIPTIONS[pendingKind]}</Text>
          {/* ルール一文（[決定] 2026-07-26）: 種目名/説明の近くに1文だけ。 */}
          <Text style={styles.dlgRule}>{QUIZ_RULE_NOTE}</Text>
          <Text style={styles.dlgRecentTitle}>直近の記録</Text>
          {recent === null ? (
            <Text style={styles.dlgEmpty}>読み込み中…</Text>
          ) : recent.length === 0 ? (
            <Text style={styles.dlgEmpty}>{QUIZ_EMPTY_HISTORY_MESSAGE}</Text>
          ) : (
            <View style={styles.dlgRecent} testID="recent-list">
              {recent.map((x) => (
                <Text key={x.id} style={styles.dlgLine}>
                  {quizRecentLine(x)}
                </Text>
              ))}
            </View>
          )}
          {dialogError ? (
            <Text style={styles.error} accessibilityRole="alert">
              {dialogError}
            </Text>
          ) : null}
          {dialogError === QUIZ_LIMIT_MESSAGE && onOpenSettings ? (
            <Pressable style={styles.upgrade} onPress={onOpenSettings} accessibilityRole="button">
              <Text style={styles.upgradeText}>プランをアップグレード</Text>
            </Pressable>
          ) : null}
          <View style={styles.dlgActions}>
            <Pressable
              style={({ pressed }) => [
                styles.submit,
                starting && styles.submitOff,
                pressed && !starting && styles.pressed,
              ]}
              disabled={starting}
              onPress={() => void startFromDialog()}
              accessibilityRole="button"
            >
              <Text style={styles.submitText}>開始</Text>
            </Pressable>
            <Pressable
              style={({ pressed }) => [styles.backBtn, pressed && styles.pressed]}
              onPress={closeStartDialog}
              accessibilityRole="button"
            >
              <Text style={styles.backText}>もどる</Text>
            </Pressable>
          </View>
        </BottomSheet>
      ) : null}
    </View>
  );
}

/**
 * 牌効率の見直し行に出す受け入れ詳細（web の UkeireDetail と同一挙動）。
 * 計算は共有ヘッドレスモデル（@rigel/ui の ukeireReviewModel）に一元化し、
 * 結果画面の描画時に行う（60秒セッション中の負荷を増やさない）。
 * 計算は重い（14枚×34種の向聴総当たり）ので useMemo で手牌が変わらない再レンダーでは
 * 再計算しない。
 */
function UkeireDetail({
  no,
  tiles,
  picked,
}: {
  no: number;
  tiles: readonly Tile[];
  picked: Tile | null;
}) {
  const model = useMemo(() => ukeireReviewModel(tiles, picked), [tiles, picked]);
  const { mine, regressed, best } = model;
  return (
    <View style={styles.ukeireDetail}>
      {mine ? (
        <View style={styles.ukeireLine} testID={`review-ukeire-mine-${no}`}>
          {regressed ? <Text style={styles.regress}>向聴戻し</Text> : null}
          <Text style={styles.ukeireCount}>
            受け入れ {mine.tiles.length}種{mine.count}枚
          </Text>
          <View style={styles.reviewTiles}>
            {mine.tiles.map((t, j) => (
              <MiniTile key={j} code={t} w={18} h={25} />
            ))}
          </View>
        </View>
      ) : null}
      {best.map((u) => (
        <View key={u.discard} style={styles.ukeireLine}>
          <MiniTile code={u.discard} w={18} h={25} />
          <Text style={styles.ukeireArrow}>→</Text>
          <View style={styles.ukeireBody} testID={`review-ukeire-best-${no}-${u.discard}`}>
            <Text style={styles.ukeireCount}>
              受け入れ {u.tiles.length}種{u.count}枚
            </Text>
            <View style={styles.reviewTiles}>
              {u.tiles.map((t, j) => (
                <MiniTile key={j} code={t} w={18} h={25} />
              ))}
            </View>
          </View>
        </View>
      ))}
    </View>
  );
}

/** 出題エリア（清一色=待ち牌の複数選択 / 牌効率=切る牌のタップ / 点数計算=4択）。 */
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
      <View style={styles.panel}>
        <Text style={styles.question}>{QUIZ_KIND_PROMPTS.score}</Text>
        <Text style={styles.scoreCond}>{question.label}</Text>
        <View style={styles.doraRow} testID="score-dora">
          <Text style={styles.doraLabel}>ドラ表示</Text>
          {question.doraIndicators.map((t, i) => (
            <MiniTile key={i} code={t} w={22} h={30} />
          ))}
        </View>
        <View style={styles.scoreHand}>
          <View style={[styles.hand, styles.scoreHandTiles]} testID="score-hand">
            {scoreDisplayTiles(question).map((t, i) => (
              <MiniTile key={i} code={t} w={22} h={30} />
            ))}
          </View>
          {question.melds.map((m, mi) => (
            <View key={mi} style={styles.meld} testID={`score-meld-${mi}`}>
              {scoreMeldViews(m, question.seatWind).map((v, j) =>
                v.back ? (
                  <View key={j} style={styles.tileBack} />
                ) : (
                  <View key={j} style={v.lay ? styles.lay : null}>
                    <MiniTile code={v.tile} w={22} h={30} />
                  </View>
                ),
              )}
            </View>
          ))}
          <View style={styles.winSlot} testID="score-win">
            <View style={styles.winTile}>
              <MiniTile code={question.winTile} w={22} h={30} />
            </View>
            <Text style={styles.winBadge}>{question.tsumo ? "ツモ" : "ロン"}</Text>
          </View>
        </View>
        <View style={styles.choices2}>
          {question.choices.map((c) => (
            <Pressable
              key={c}
              style={({ pressed }) => [styles.choice, pressed && !grading && styles.pressed]}
              disabled={grading}
              onPress={() => onChooseScore(c)}
              accessibilityRole="button"
            >
              <Text style={styles.choiceText}>{c}</Text>
            </Pressable>
          ))}
        </View>
      </View>
    );
  }

  if (question.kind === "chinitsu") {
    // 候補は出題スート（単色）の1〜9。回答後も正答は見せない（○×のみ。見直しは結果画面）。
    const suit = question.tiles[0]![1]!;
    const candidates = Array.from({ length: 9 }, (_, i) => `${i + 1}${suit}` as Tile);
    return (
      <View style={styles.panel}>
        <Text style={styles.question}>{QUIZ_KIND_PROMPTS.chinitsu}</Text>
        {/* 牌は白地カードに載せず暗い背景へ直接・中央揃え（[決定] 2026-07-25 オーナーレビュー）。 */}
        <View style={styles.hand}>
          {question.tiles.map((t, i) => (
            <MiniTile key={i} code={t} w={26} h={36} />
          ))}
        </View>
        <View style={styles.candidates}>
          {candidates.map((t) => {
            const on = picked.includes(t);
            return (
              <Pressable
                key={t}
                style={({ pressed }) => [
                  on && styles.sel,
                  pressed && !grading && styles.tilePressed,
                ]}
                disabled={grading}
                onPress={() => onToggleWait(t)}
                accessibilityRole="button"
                accessibilityLabel={tileLabel(t)}
                accessibilityState={{ selected: on }}
                // 牌は 34×47 で 44pt 未満。見た目を変えずタップ領域だけ 44×59 に広げる
                //（gap=8/4 の半分未満なので隣の牌と重ならない）。
                hitSlop={{ top: 6, bottom: 6, left: 5, right: 5 }}
              >
                <MiniTile code={t} w={34} h={47} />
              </Pressable>
            );
          })}
        </View>
        <View style={styles.submitRow}>
          <Pressable
            style={({ pressed }) => [
              styles.submit,
              (grading || picked.length === 0) && styles.submitOff,
              pressed && !grading && picked.length > 0 && styles.pressed,
            ]}
            disabled={grading || picked.length === 0}
            onPress={onSubmitChinitsu}
            accessibilityRole="button"
          >
            <Text style={styles.submitText}>回答</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.panel}>
      <Text style={styles.question}>{QUIZ_KIND_PROMPTS.efficiency}</Text>
      {/* 牌は白地カードに載せず暗い背景へ直接・中央揃え（[決定] 2026-07-25 オーナーレビュー）。 */}
      <View style={styles.hand}>
        {question.tiles.map((t, i) => (
          <Pressable
            key={i}
            style={({ pressed }) => (pressed && !grading ? styles.tilePressed : null)}
            disabled={grading}
            onPress={() => onDiscard(t)}
            accessibilityRole="button"
            accessibilityLabel={tileLabel(t)}
            // 牌は 34×47 で 44pt 未満。見た目を変えずタップ領域だけ 44×59 に広げる。
            hitSlop={{ top: 6, bottom: 6, left: 5, right: 5 }}
          >
            <MiniTile code={t} w={34} h={47} />
          </Pressable>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  root: { flex: 1, backgroundColor: colors.bg },
  body: { padding: 16, paddingBottom: 32, gap: 10 },
  // 開始ダイアログ（BottomSheet 内。ボタンは既存の submit（accent 主）/backBtn（線 副）を流用）
  dlgTitle: { color: colors.white, fontSize: 17, fontWeight: "800", marginTop: 4 },
  dlgDesc: { color: colors.w70, fontSize: 12, lineHeight: 19, marginTop: 6 },
  // ルール一文（説明の直下・控えめに）
  dlgRule: { color: colors.w45, fontSize: 11.5, marginTop: 8 },
  dlgRecentTitle: { color: colors.w45, fontSize: 11, marginTop: 14, marginBottom: 6 },
  dlgRecent: { gap: 4 },
  dlgLine: {
    color: colors.w70,
    fontSize: 12,
    fontVariant: ["tabular-nums"],
    backgroundColor: colors.chrome2,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
    borderRadius: radius.base,
    paddingVertical: 6,
    paddingHorizontal: 10,
    overflow: "hidden",
  },
  dlgEmpty: { color: colors.w45, fontSize: 12 },
  dlgActions: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: 10,
    marginTop: 16,
  },
  // 開始カウントダウン（出題エリアに大きく 3→2→1。牌・タイマーは出さない）
  countdown: {
    paddingVertical: 40,
    textAlign: "center",
    color: colors.emLite,
    fontSize: 64,
    fontWeight: "800",
    fontVariant: ["tabular-nums"],
  },
  title: { color: colors.white, fontSize: 20, fontWeight: "800" },
  section: { gap: 10 },
  // 種目選択カード（牌モチーフ3枚のファン＋タイトル/説明の階層）。
  // 角丸は共通トークン（カード=radius.card・ボタン=radius.base）に統一
  // （[決定] 2026-07-25 オーナーレビュー。KifuCard 等の既存カードと同じ値）。
  card: {
    backgroundColor: colors.chrome2,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
    borderRadius: radius.card,
    padding: 18,
    gap: 8,
  },
  cardPressed: { transform: [{ scale: 0.98 }], borderColor: colors.accent },
  cardFan: { flexDirection: "row", gap: 2, paddingLeft: 4, paddingBottom: 2 },
  fanTile: {},
  fanL: { transform: [{ rotate: "-12deg" }, { translateY: 2 }] },
  fanR: { transform: [{ rotate: "12deg" }, { translateY: 2 }] },
  cardTitle: { color: colors.white, fontSize: 17, fontWeight: "800", letterSpacing: 0.3 },
  cardDesc: { color: colors.w70, fontSize: 12, lineHeight: 19 },
  error: { color: colors.vermilion, fontSize: 13 },
  upgrade: {
    alignSelf: "flex-start",
    backgroundColor: colors.accent,
    borderRadius: radius.base,
    paddingVertical: 10,
    paddingHorizontal: 20,
  },
  upgradeText: { color: "#16181d", fontWeight: "800", fontSize: 13 },
  // セッション中 HUD（残り秒が主役・スコアはチップ・上部の固定バー感）
  hud: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    gap: 10,
    backgroundColor: colors.chrome,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
    borderRadius: radius.card,
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  hudKind: { color: colors.w70, fontSize: 12, fontWeight: "700" },
  hudScore: {
    color: colors.white,
    fontSize: 12,
    fontWeight: "800",
    fontVariant: ["tabular-nums"],
    backgroundColor: colors.chrome2,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
    borderRadius: 999,
    paddingVertical: 3,
    paddingHorizontal: 10,
    overflow: "hidden",
  },
  hudTime: {
    marginLeft: "auto",
    color: colors.emLite,
    fontSize: 21,
    fontWeight: "800",
    fontVariant: ["tabular-nums"],
  },
  // 残り10秒未満: 要確認カラー #d10f3a 系の赤で焦りを可視化
  hudTimeLow: { color: "#ff5f75" },
  panel: {
    backgroundColor: colors.chrome,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
    borderRadius: radius.card,
    padding: 14,
    gap: 12,
  },
  question: { color: colors.w70, fontSize: 12.5, textAlign: "center" },
  // 出題エリアは中央揃え。牌は白地カードに載せず暗い背景へ直接置く。
  hand: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
  },
  // 牌姿との間に明確な余白を置く（panel の gap に上乗せ）。
  candidates: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "center",
    gap: 8,
    marginTop: 10,
  },
  sel: {
    borderWidth: 2,
    borderColor: colors.accent,
    borderRadius: 6,
    margin: -2,
    transform: [{ translateY: -4 }],
  },
  // 点数計算: 条件（自風・ツモロン・場風）は出題の主役なので大きく中央に
  scoreCond: {
    textAlign: "center",
    color: colors.white,
    fontSize: 19,
    fontWeight: "800",
    marginBottom: 4,
  },
  // 牌姿列: 手牌・カン・上がり牌。狭幅端末では副露・和了牌が次行に折り返すが、
  // グループ単位で折り返す（牌単位でバラけない）ため読みやすさは保たれる。
  scoreHand: {
    flexDirection: "row",
    flexWrap: "wrap",
    // 下端揃え: 和了牌のバッジ（牌の上）があっても牌の高さは手牌と揃う。
    alignItems: "flex-end",
    justifyContent: "center",
    gap: 12,
    rowGap: 8,
    paddingTop: 14,
  },
  // 点数計算の手牌グループは折り返さない（密着・バラけ防止。牌サイズ側で幅を収める）。
  scoreHandTiles: {
    flexWrap: "nowrap",
    gap: 3,
  },
  meld: { flexDirection: "row", alignItems: "flex-end", gap: 2 },
  // 暗槓の背面（面を伏せた牌）
  tileBack: {
    width: 22,
    height: 30,
    borderRadius: 4,
    backgroundColor: "#274a37",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(255,255,255,0.18)",
  },
  // 鳴いた牌の横向き（位置が鳴き元を示す。ポン/チー/大明槓共通）
  lay: { transform: [{ rotate: "90deg" }] },
  // ドラ表示牌（小ラベル+牌1〜2枚。牌姿の上に控えめに）
  doraRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },
  doraLabel: { color: colors.w45, fontSize: 11 },
  // 上がり牌: 手牌と分けて強調（アクセント枠）＋ロン/ツモのバッジ
  winTile: {
    borderWidth: 2,
    borderColor: colors.accent,
    borderRadius: 6,
    margin: -2,
  },
  // バッジ（ロン/ツモ）を牌の上に縦積みして横幅を節約（web と同じ構造）。
  winSlot: { flexDirection: "column-reverse", alignItems: "center", gap: 2 },
  winBadge: { color: colors.accent, fontSize: 11, fontWeight: "800", letterSpacing: 1 },
  // 選択肢4ボタン: 2×2・中央揃え・共通トークン（radius.base / line）
  choices2: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "center",
    gap: 10,
    marginTop: 10,
  },
  choice: {
    width: "47%",
    backgroundColor: colors.chrome2,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
    borderRadius: radius.base,
    paddingVertical: 13,
    paddingHorizontal: 8,
    alignItems: "center",
  },
  choiceText: {
    color: colors.white,
    fontSize: 14,
    fontWeight: "800",
    fontVariant: ["tabular-nums"],
  },
  // 見直しリストのテキスト行（点数計算の条件・回答・正解）
  reviewText: { color: colors.w70, fontSize: 12.5, fontVariant: ["tabular-nums"] },
  reviewMeld: { flexDirection: "row", gap: 2, marginLeft: 6 },
  reviewBack: {
    width: 18,
    height: 25,
    borderRadius: 3,
    backgroundColor: "#274a37",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(255,255,255,0.18)",
  },
  tilePressed: { transform: [{ scale: 0.94 }] },
  pressed: { transform: [{ scale: 0.97 }] },
  submitRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
    minHeight: 44,
    marginTop: 4,
  },
  // 主ボタンは既存画面（ProblemAnswerScreen .submit）と同じ accent + radius.base
  submit: {
    backgroundColor: colors.accent,
    borderRadius: radius.base,
    paddingVertical: 12,
    paddingHorizontal: 34,
    alignItems: "center",
  },
  submitOff: { opacity: 0.4 },
  submitText: { color: "#16181d", fontWeight: "800", fontSize: 14 },
  // フィードバック帯（出題パネル直下の固定高さスロット。回答受付中は透明のまま高さを確保し、
  // 回答直後だけ 正解=緑系（emLite 系）/不正解=赤系（#d10f3a 系）に塗る。牌に被せない）
  feedbackBand: {
    height: 46,
    borderRadius: radius.card,
    alignItems: "center",
    justifyContent: "center",
  },
  bandOk: { backgroundColor: "rgba(62,196,135,0.16)" },
  bandNg: { backgroundColor: "rgba(209,15,58,0.16)" },
  bandText: { fontSize: 15, fontWeight: "800", letterSpacing: 1 },
  ok: { color: colors.emLite },
  // 不正解の赤は要確認カラー #d10f3a 系（暗背景でも読める明度に調整）
  ng: { color: "#ff5f75" },
  resultBox: {
    backgroundColor: colors.chrome,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
    borderRadius: radius.card,
    padding: 14,
    gap: 8,
  },
  resultHead: { color: colors.w45, fontSize: 12, fontWeight: "800" },
  resultLine: { color: colors.w70, fontSize: 12.5, fontWeight: "700" },
  // スコアの stat カード横並び（正解数・出題数・正答率）。スリム表示
  // （[決定] 2026-07-25 オーナーレビュー: 数値フォントは維持し縦幅を従来の6〜7割に）
  stats: { flexDirection: "row", gap: 8, marginTop: 2 },
  stat: {
    flex: 1,
    color: colors.white,
    backgroundColor: colors.chrome2,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
    borderRadius: radius.card,
    paddingVertical: 7,
    paddingHorizontal: 4,
    textAlign: "center",
    fontSize: 13,
    fontWeight: "800",
    fontVariant: ["tabular-nums"],
    overflow: "hidden",
  },
  // 見直しリスト（結果画面のみ）
  review: {
    marginTop: 8,
    paddingTop: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.line,
    gap: 10,
  },
  // 行はカード化し、左端に○×の色帯（緑/赤）を敷く
  reviewRow: {
    gap: 6,
    backgroundColor: colors.chrome2,
    borderRadius: radius.card,
    borderLeftWidth: 3,
    paddingVertical: 10,
    paddingLeft: 12,
    paddingRight: 10,
  },
  rowOk: { borderLeftColor: colors.emLite },
  rowNg: { borderLeftColor: "#d10f3a" },
  reviewNo: { color: colors.w70, fontSize: 13, fontWeight: "800" },
  reviewMark: { fontSize: 14, fontWeight: "800" },
  reviewTiles: { flexDirection: "row", flexWrap: "wrap", gap: 2 },
  reviewLine: { flexDirection: "row", alignItems: "center", gap: 6 },
  // 問題の牌列（13-14枚）はラベルの横で折り返す。
  reviewLineTiles: { flexShrink: 1 },
  reviewLabel: { color: colors.w45, fontSize: 11 },
  // 受け入れ詳細（牌効率のみ。あなたの回答の受け入れ＋正解各打牌の受け入れ）
  ukeireDetail: { gap: 4, marginTop: 2 },
  ukeireLine: { flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 6 },
  ukeireBody: { flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 6, flex: 1 },
  ukeireArrow: { color: colors.w45, fontSize: 11 },
  ukeireCount: { color: colors.w70, fontSize: 11, fontVariant: ["tabular-nums"] },
  // 向聴戻しバッジ（要確認カラー #d10f3a 系の赤で警告。REVIEW_COLOR と整合）
  regress: {
    color: "#ff8fa8",
    backgroundColor: "rgba(209,15,58,0.18)",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(209,15,58,0.55)",
    borderRadius: radius.base,
    paddingHorizontal: 6,
    paddingVertical: 1,
    fontSize: 10,
    fontWeight: "800",
    overflow: "hidden",
  },
  sendError: { color: colors.vermilion, fontSize: 12 },
  // 結果画面の操作: 主=もう一度挑戦（accent）／副=問題選択にもどる（線ボタン。
  // ProblemAnswerScreen の redoBtn と同じ「明るい線＋薄い面」の既存フォーム）。
  // 横並びで中央寄せ（[決定] 2026-07-25 オーナーレビュー・web と同構成）
  resultActions: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 10,
    marginTop: 4,
  },
  retry: {
    backgroundColor: colors.accent,
    borderRadius: radius.base,
    paddingVertical: 12,
    paddingHorizontal: 22,
    alignItems: "center",
  },
  retryText: { color: "#16181d", fontWeight: "800", fontSize: 14 },
  backBtn: {
    backgroundColor: "rgba(255,255,255,0.08)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.38)",
    borderRadius: radius.base,
    paddingVertical: 10,
    paddingHorizontal: 22,
    alignItems: "center",
  },
  backText: { color: colors.white, fontWeight: "700", fontSize: 13 },
});
