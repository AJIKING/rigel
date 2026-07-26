// ============================================================
// 特訓クイズのセッション状態機械（web/mobile 共有・React 非依存）
// ------------------------------------------------------------
// 60秒タイムアタックの全遷移（ダイアログ→開始→3,2,1→出題→回答→○×→次問→時間切れ→
// 結果→retry/back）を純粋な reducer に一元化する（2026-07-26 に web/mobile の
// TrainingScreen 二重実装を解消）。画面側は「イベントを dispatch して state を描画する」
// だけにし、API 呼び出し・タイマー駆動・analytics は画面側の副作用として残す
// （結果送信は sessionResult() を経由し、適用は sessionId 一致ガードで前セッションの
// 遅延失敗を新しい画面へ混入させない）。
//
// タイマーは実時刻基準: 開始時に deadline（epoch ms）を取り、TIMER_TICK が now を運んで
// 残り秒を計算する。setInterval のドリフトや tick 遅延で 60 秒を超えても、durationMs は
// 実測を「sessionSeconds*1000 + スラック」と QuizResultSchema の上限 120000 で clamp して
// 記録する（旧実装は常に sessionSeconds*1000 を送っていた＝実測とのドリフト。根治）。
//
// rng（createQuizRng）はクロージャで state に持てない（reducer の純粋性が壊れ、React の
// StrictMode 二重実行で消費数がずれる）ため、出題は ctx.nextQuestion として画面側が渡す。
// テストは固定出題を注入して決定的に検証できる（seed 実測の焼き付けを画面テストから排除）。
// ============================================================

import { type QuizKind, type QuizResult, type Tile } from "@rigel/schema";
import {
  generateChinitsuQuestion,
  generateChinitsuUkeireQuestion,
  generateEfficiencyQuestion,
  type ChinitsuQuestion,
  type ChinitsuUkeireQuestion,
  type EfficiencyQuestion,
  type QuizAnswerRecord,
} from "./quiz";
import { QUIZ_COUNTDOWN_SECONDS, QUIZ_SESSION_SECONDS } from "./quiz-copy";
import { generateScoreQuestion, type ScoreQuestion } from "./quiz-score-question";

/** 特訓クイズの出題（3種目の合併型。web/mobile の画面と reducer が共有）。 */
export type QuizQuestion =
  ChinitsuQuestion | ChinitsuUkeireQuestion | EfficiencyQuestion | ScoreQuestion;

export type QuizPhase = "select" | "countdown" | "running" | "result";

/** 終了 tick の遅延に対する durationMs の実測余裕（tick 間隔=1秒ぶん）。
 *  これを超える遅延（バックグラウンド等）は「セッションの実プレイ時間」ではないので clamp する。 */
export const QUIZ_DURATION_SLACK_MS = 1000;

/** QuizResultSchema の durationMs 上限（背骨の max(120_000) と同値。超える結果は送らない）。 */
const QUIZ_DURATION_MAX_MS = 120_000;

export interface QuizSessionState {
  phase: QuizPhase;
  /** 現在（または直近）のセッションの種目。 */
  kind: QuizKind;
  /** 開始ダイアログの対象種目（null=閉。開いただけでは枠を消費しない）。 */
  pendingKind: QuizKind | null;
  /** 開始 API が発行したセッション id（結果送信の宛先。select の初期状態のみ null）。 */
  sessionId: string | null;
  /** 開始カウントダウンの残り（3→2→1。phase="countdown" 中のみ意味を持つ）。 */
  countdown: number;
  /** running 開始の実時刻（epoch ms）。durationMs の実測に使う。 */
  startedAt: number | null;
  /** セッション終了の実時刻（epoch ms）。TIMER_TICK が now と比較する。 */
  deadline: number | null;
  /** 表示用の残り秒（deadline と now から計算。内部カウンタの引き算はしない）。 */
  secondsLeft: number;
  total: number;
  correct: number;
  question: QuizQuestion | null;
  /** 清一色: 選択中の待ち牌（回答前）。 */
  picked: readonly Tile[];
  /** 回答直後の正誤表示（画面が QUIZ_FEEDBACK_MS 後に FEEDBACK_DONE を送る）。null=回答受付中。 */
  feedback: "ok" | "ng" | null;
  /** 見直しリスト（回答済みの問題のみ。サーバへは送らない）。 */
  records: readonly QuizAnswerRecord[];
  /** 実測の所要ミリ秒（result 遷移時に確定・clamp 済み）。 */
  durationMs: number | null;
  /** 1回の挑戦の秒数（既定 QUIZ_SESSION_SECONDS=60。dev プレビューの短縮注入口）。 */
  sessionSeconds: number;
  /** 開始カウントダウンの秒数（既定 QUIZ_COUNTDOWN_SECONDS=3。0=即開始）。 */
  countdownSeconds: number;
}

export type QuizSessionEvent =
  | { type: "OPEN_DIALOG"; kind: QuizKind }
  | { type: "CLOSE_DIALOG" }
  /** 開始 API 成功後に画面が送る（枠消費はサーバ側。失敗時は dispatch しない）。 */
  | { type: "START"; kind: QuizKind; sessionId: string; now: number }
  | { type: "COUNTDOWN_TICK"; now: number }
  | { type: "TIMER_TICK"; now: number }
  | { type: "TOGGLE_WAIT"; tile: Tile }
  | { type: "SUBMIT_CHINITSU" }
  | { type: "DISCARD"; tile: Tile }
  | { type: "CHOOSE_SCORE"; choice: string }
  | { type: "FEEDBACK_DONE" }
  /** 結果画面の「もう一度挑戦」（同じ種目・新しい sessionId）。 */
  | { type: "RETRY"; sessionId: string; now: number }
  | { type: "BACK_TO_SELECT" };

/** 出題の供給（reducer の外部依存）。rng は画面側が保持し、テストは固定出題を注入する。 */
export interface QuizSessionContext {
  nextQuestion: (kind: QuizKind) => QuizQuestion;
}

/** 既定の出題生成（種目→既存生成器の配線。画面の generateQuestion 注入が無いときに使う）。 */
export function defaultQuizQuestion(kind: QuizKind, rng: () => number): QuizQuestion {
  return kind === "chinitsu"
    ? generateChinitsuQuestion(rng)
    : kind === "chinitsuUkeire"
      ? generateChinitsuUkeireQuestion(rng)
      : kind === "efficiency"
        ? generateEfficiencyQuestion(rng)
        : generateScoreQuestion(rng);
}

/** 初期状態（種目選択）を作る。 */
export function createQuizSession(
  opts: {
    kind?: QuizKind;
    sessionSeconds?: number;
    countdownSeconds?: number;
  } = {},
): QuizSessionState {
  const sessionSeconds = opts.sessionSeconds ?? QUIZ_SESSION_SECONDS;
  return {
    phase: "select",
    kind: opts.kind ?? "chinitsu",
    pendingKind: null,
    sessionId: null,
    countdown: 0,
    startedAt: null,
    deadline: null,
    secondsLeft: sessionSeconds,
    total: 0,
    correct: 0,
    question: null,
    picked: [],
    feedback: null,
    records: [],
    durationMs: null,
    sessionSeconds,
    countdownSeconds: opts.countdownSeconds ?? QUIZ_COUNTDOWN_SECONDS,
  };
}

/** 終了時にサーバへ送る結果。durationMs はここに一本化（実測の clamp 済み値。
 *  result 前に呼ばれた場合のみ念のため sessionSeconds から補う）。 */
export function sessionResult(state: QuizSessionState): QuizResult {
  return {
    kind: state.kind,
    total: state.total,
    correct: state.correct,
    durationMs: state.durationMs ?? Math.min(state.sessionSeconds * 1000, QUIZ_DURATION_MAX_MS),
  };
}

/** セッション終了（時間切れ）。durationMs を実測から確定する。 */
function endSession(state: QuizSessionState, now: number): QuizSessionState {
  const measured = state.startedAt === null ? state.sessionSeconds * 1000 : now - state.startedAt;
  const durationMs = Math.max(
    0,
    Math.min(measured, state.sessionSeconds * 1000 + QUIZ_DURATION_SLACK_MS, QUIZ_DURATION_MAX_MS),
  );
  return { ...state, phase: "result", secondsLeft: 0, feedback: null, durationMs };
}

/** 第1問と同時に 60 秒（sessionSeconds）を開始する。sessionSeconds=0（dev の結果
 *  ショートカット）は即 result。 */
function beginRunning(
  state: QuizSessionState,
  now: number,
  ctx: QuizSessionContext,
): QuizSessionState {
  const running: QuizSessionState = {
    ...state,
    phase: "running",
    countdown: 0,
    question: ctx.nextQuestion(state.kind),
    picked: [],
    feedback: null,
    startedAt: now,
    deadline: now + state.sessionSeconds * 1000,
    secondsLeft: state.sessionSeconds,
  };
  return state.sessionSeconds > 0 ? running : endSession(running, now);
}

/** セッション開始の共通処理（START / RETRY）。スコア・見直しをリセットして
 *  カウントダウンへ（countdownSeconds=0 は即 running）。 */
function begin(
  state: QuizSessionState,
  kind: QuizKind,
  sessionId: string,
  now: number,
  ctx: QuizSessionContext,
): QuizSessionState {
  const base: QuizSessionState = {
    ...state,
    phase: "countdown",
    kind,
    pendingKind: null,
    sessionId,
    countdown: state.countdownSeconds,
    startedAt: null,
    deadline: null,
    secondsLeft: state.sessionSeconds,
    total: 0,
    correct: 0,
    question: null,
    picked: [],
    feedback: null,
    records: [],
    durationMs: null,
  };
  return state.countdownSeconds > 0 ? base : beginRunning(base, now, ctx);
}

/** 採点して○×を出し、見直しリストへ記録する（次問は FEEDBACK_DONE で進む）。 */
function grade(
  state: QuizSessionState,
  ok: boolean,
  picked: readonly Tile[],
  pickedChoice?: string,
): QuizSessionState {
  return {
    ...state,
    total: state.total + 1,
    correct: state.correct + (ok ? 1 : 0),
    records: [
      ...state.records,
      { question: state.question!, picked: [...picked], pickedChoice, ok },
    ],
    feedback: ok ? "ok" : "ng",
  };
}

/** 回答イベントを受け付けられる状態か（セッション中・○×表示中でない・出題の種目が一致）。 */
function canAnswer(state: QuizSessionState, kind: QuizKind): boolean {
  return state.phase === "running" && state.feedback === null && state.question?.kind === kind;
}

export function quizSessionReducer(
  state: QuizSessionState,
  event: QuizSessionEvent,
  ctx: QuizSessionContext,
): QuizSessionState {
  switch (event.type) {
    case "OPEN_DIALOG":
      return state.phase === "select" ? { ...state, pendingKind: event.kind } : state;
    case "CLOSE_DIALOG":
      return state.pendingKind === null ? state : { ...state, pendingKind: null };
    case "START":
      return state.phase === "select"
        ? begin(state, event.kind, event.sessionId, event.now, ctx)
        : state;
    case "RETRY":
      return state.phase === "result"
        ? begin(state, state.kind, event.sessionId, event.now, ctx)
        : state;
    case "COUNTDOWN_TICK": {
      if (state.phase !== "countdown") return state;
      const countdown = state.countdown - 1;
      return countdown <= 0
        ? beginRunning({ ...state, countdown: 0 }, event.now, ctx)
        : { ...state, countdown };
    }
    case "TIMER_TICK": {
      if (state.phase !== "running" || state.deadline === null) return state;
      if (event.now >= state.deadline) return endSession(state, event.now);
      return {
        ...state,
        secondsLeft: Math.max(0, Math.ceil((state.deadline - event.now) / 1000)),
      };
    }
    case "TOGGLE_WAIT": {
      if (!canAnswer(state, "chinitsu")) return state;
      const on = state.picked.includes(event.tile);
      return {
        ...state,
        picked: on ? state.picked.filter((t) => t !== event.tile) : [...state.picked, event.tile],
      };
    }
    case "SUBMIT_CHINITSU": {
      if (!canAnswer(state, "chinitsu") || state.picked.length === 0) return state;
      const answer = new Set<Tile>((state.question as ChinitsuQuestion).answer);
      const ok = state.picked.length === answer.size && state.picked.every((t) => answer.has(t));
      return grade(state, ok, state.picked);
    }
    case "DISCARD": {
      // 打牌1枚で答える種目（牌効率・清一色 牌効率）は同じ経路で採点する。
      if (!canAnswer(state, "efficiency") && !canAnswer(state, "chinitsuUkeire")) return state;
      const question = state.question as EfficiencyQuestion | ChinitsuUkeireQuestion;
      return grade(state, question.answer.includes(event.tile), [event.tile]);
    }
    case "CHOOSE_SCORE": {
      if (!canAnswer(state, "score")) return state;
      const ok = event.choice === (state.question as ScoreQuestion).answer;
      return grade(state, ok, [], event.choice);
    }
    case "FEEDBACK_DONE":
      if (state.phase !== "running" || state.feedback === null) return state;
      return {
        ...state,
        question: ctx.nextQuestion(state.kind),
        picked: [],
        feedback: null,
      };
    case "BACK_TO_SELECT":
      return state.phase === "result"
        ? {
            ...state,
            phase: "select",
            pendingKind: null,
            question: null,
            picked: [],
            feedback: null,
          }
        : state;
  }
}
