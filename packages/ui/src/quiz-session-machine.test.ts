import { describe, expect, it } from "vitest";
import { QuizResultSchema, type QuizKind, type Tile } from "@rigel/schema";
import {
  createQuizRng,
  generateChinitsuQuestion,
  generateEfficiencyQuestion,
  type ChinitsuQuestion,
  type ChinitsuUkeireQuestion,
  type EfficiencyQuestion,
} from "./quiz";
import { generateScoreQuestion, type ScoreQuestion } from "./quiz-score-question";
import {
  createQuizSession,
  defaultQuizQuestion,
  quizSessionReducer,
  sessionResult,
  QUIZ_DURATION_SLACK_MS,
  type QuizQuestion,
  type QuizSessionContext,
  type QuizSessionState,
} from "./quiz-session-machine";

// ============================================================
// セッション状態機械（web/mobile 共有）の全遷移テスト。
// 出題は固定フィクスチャを ctx.nextQuestion で注入する（seed 実測の焼き付けはしない。
// 「この手の正解がこれ」という出題内容の正しさは quiz.test.ts / ukeire.test.ts /
// quiz-score-question 側のテストが担保する）。
// ============================================================

const CHINITSU_Q1: ChinitsuQuestion = {
  kind: "chinitsu",
  // prettier-ignore
  tiles: ["1p", "2p", "3p", "4p", "4p", "5p", "5p", "5p", "6p", "6p", "7p", "8p", "9p"],
  answer: ["4p", "5p", "6p"],
};
const CHINITSU_Q2: ChinitsuQuestion = {
  kind: "chinitsu",
  // prettier-ignore
  tiles: ["1s", "2s", "3s", "4s", "4s", "5s", "5s", "6s", "6s", "7s", "8s", "8s", "8s"],
  answer: ["1s", "3s", "4s", "6s", "7s", "9s"],
};
const EFFICIENCY_Q1: EfficiencyQuestion = {
  kind: "efficiency",
  // prettier-ignore
  tiles: ["3m", "3m", "5m", "7m", "3p", "5p", "6p", "7p", "8p", "6s", "7s", "9s", "4z", "7z"],
  shanten: 2,
  answer: ["9s", "4z", "7z"],
};
const SCORE_Q1: ScoreQuestion = {
  kind: "score",
  // prettier-ignore
  closedTiles: ["4m", "5m", "6m", "1p", "1p", "1p", "5p", "5p", "1s", "1s", "2s", "2s", "3s", "3s"],
  melds: [],
  winTile: "3s",
  tsumo: false,
  riichi: true,
  seatWind: "east",
  roundWind: "east",
  doraIndicators: ["5z"],
  yaku: [
    { name: "立直", han: 1 },
    { name: "一盃口", han: 1 },
  ],
  han: 2,
  fu: 40,
  label: "親（東家）・リーチ・ロン・場風 東",
  choices: ["7700点", "3900点", "4800点", "2600点"],
  answer: "3900点",
};

const T0 = 1_000_000;

/** 固定出題を順番に返す ctx（末尾まで行ったら循環）。 */
function ctxOf(questions: readonly QuizQuestion[]): QuizSessionContext {
  let i = 0;
  return { nextQuestion: () => questions[i++ % questions.length]! };
}

/** ダイアログ→START→カウントダウン消化まで進めて running 状態を作る。 */
function startRunning(
  kind: QuizKind,
  questions: readonly QuizQuestion[],
  opts: Parameters<typeof createQuizSession>[0] = {},
): { state: QuizSessionState; ctx: QuizSessionContext; runStart: number } {
  const ctx = ctxOf(questions);
  let s = createQuizSession(opts);
  s = quizSessionReducer(s, { type: "OPEN_DIALOG", kind }, ctx);
  s = quizSessionReducer(s, { type: "START", kind, sessionId: "qs1", now: T0 }, ctx);
  let t = 0;
  while (s.phase === "countdown") {
    t += 1000;
    s = quizSessionReducer(s, { type: "COUNTDOWN_TICK", now: T0 + t }, ctx);
  }
  return { state: s, ctx, runStart: T0 + t };
}

describe("quizSessionReducer: ダイアログ→開始→カウントダウン", () => {
  it("createQuizSession の初期状態は select・既定 60秒/3秒・スコア0", () => {
    const s = createQuizSession();
    expect(s.phase).toBe("select");
    expect(s.sessionSeconds).toBe(60);
    expect(s.countdownSeconds).toBe(3);
    expect(s.secondsLeft).toBe(60);
    expect(s.total).toBe(0);
    expect(s.correct).toBe(0);
    expect(s.records).toEqual([]);
    expect(s.pendingKind).toBeNull();
    expect(s.sessionId).toBeNull();
  });

  it("OPEN_DIALOG で pendingKind が立ち、CLOSE_DIALOG で閉じる（開始はしない）", () => {
    const ctx = ctxOf([CHINITSU_Q1]);
    let s = createQuizSession();
    s = quizSessionReducer(s, { type: "OPEN_DIALOG", kind: "efficiency" }, ctx);
    expect(s.pendingKind).toBe("efficiency");
    expect(s.phase).toBe("select");
    s = quizSessionReducer(s, { type: "CLOSE_DIALOG" }, ctx);
    expect(s.pendingKind).toBeNull();
    expect(s.phase).toBe("select");
  });

  it("START で countdown 3 から始まり、sessionId を保持し、スコア・見直しをリセットする", () => {
    const ctx = ctxOf([CHINITSU_Q1]);
    let s = createQuizSession();
    s = quizSessionReducer(s, { type: "OPEN_DIALOG", kind: "chinitsu" }, ctx);
    s = quizSessionReducer(s, { type: "START", kind: "chinitsu", sessionId: "qs1", now: T0 }, ctx);
    expect(s.phase).toBe("countdown");
    expect(s.countdown).toBe(3);
    expect(s.kind).toBe("chinitsu");
    expect(s.sessionId).toBe("qs1");
    expect(s.pendingKind).toBeNull();
    expect(s.question).toBeNull(); // カウントダウン中は牌を見せない
    expect(s.secondsLeft).toBe(60);
  });

  it("COUNTDOWN_TICK で 3→2→1→0 と進み、0 で第1問と同時に running・deadline が立つ", () => {
    const ctx = ctxOf([CHINITSU_Q1]);
    let s = createQuizSession();
    s = quizSessionReducer(s, { type: "START", kind: "chinitsu", sessionId: "qs1", now: T0 }, ctx);
    s = quizSessionReducer(s, { type: "COUNTDOWN_TICK", now: T0 + 1000 }, ctx);
    expect(s.countdown).toBe(2);
    expect(s.phase).toBe("countdown");
    s = quizSessionReducer(s, { type: "COUNTDOWN_TICK", now: T0 + 2000 }, ctx);
    expect(s.countdown).toBe(1);
    s = quizSessionReducer(s, { type: "COUNTDOWN_TICK", now: T0 + 3000 }, ctx);
    expect(s.phase).toBe("running");
    expect(s.question).toEqual(CHINITSU_Q1);
    expect(s.secondsLeft).toBe(60);
    expect(s.deadline).toBe(T0 + 3000 + 60_000);
  });

  it("countdownSeconds=0 の START は即 running（dev の phase ショートカット）", () => {
    const ctx = ctxOf([EFFICIENCY_Q1]);
    let s = createQuizSession({ countdownSeconds: 0 });
    s = quizSessionReducer(s, { type: "START", kind: "efficiency", sessionId: "d1", now: T0 }, ctx);
    expect(s.phase).toBe("running");
    expect(s.question).toEqual(EFFICIENCY_Q1);
    expect(s.deadline).toBe(T0 + 60_000);
  });

  it("sessionSeconds=0 の START は即 result（dev の結果画面ショートカット。durationMs=0）", () => {
    const ctx = ctxOf([EFFICIENCY_Q1]);
    let s = createQuizSession({ countdownSeconds: 0, sessionSeconds: 0 });
    s = quizSessionReducer(s, { type: "START", kind: "efficiency", sessionId: "d1", now: T0 }, ctx);
    expect(s.phase).toBe("result");
    expect(sessionResult(s).durationMs).toBe(0);
  });

  it("カウントダウン中の TIMER_TICK は無視される（60秒タイマーが先に減り始めない）", () => {
    const ctx = ctxOf([CHINITSU_Q1]);
    let s = createQuizSession();
    s = quizSessionReducer(s, { type: "START", kind: "chinitsu", sessionId: "qs1", now: T0 }, ctx);
    const before = s;
    s = quizSessionReducer(s, { type: "TIMER_TICK", now: T0 + 2000 }, ctx);
    expect(s).toBe(before); // 変化なし（参照ごと同一）
    expect(s.secondsLeft).toBe(60);
    expect(s.phase).toBe("countdown");
  });
});

describe("quizSessionReducer: 回答（清一色・牌効率・点数計算）", () => {
  it("TOGGLE_WAIT は選択をトグルし、SUBMIT_CHINITSU は完全一致のみ正解", () => {
    let { state: s } = startRunning("chinitsu", [CHINITSU_Q1, CHINITSU_Q2]);
    const ctx = ctxOf([CHINITSU_Q2]);
    s = quizSessionReducer(s, { type: "TOGGLE_WAIT", tile: "4p" }, ctx);
    s = quizSessionReducer(s, { type: "TOGGLE_WAIT", tile: "5p" }, ctx);
    s = quizSessionReducer(s, { type: "TOGGLE_WAIT", tile: "6p" }, ctx);
    s = quizSessionReducer(s, { type: "TOGGLE_WAIT", tile: "6p" }, ctx); // 再タップで解除
    expect(s.picked).toEqual(["4p", "5p"]);
    s = quizSessionReducer(s, { type: "TOGGLE_WAIT", tile: "6p" }, ctx);
    s = quizSessionReducer(s, { type: "SUBMIT_CHINITSU" }, ctx);
    expect(s.total).toBe(1);
    expect(s.correct).toBe(1);
    expect(s.feedback).toBe("ok");
    expect(s.records).toHaveLength(1);
    expect(s.records[0]).toMatchObject({ question: CHINITSU_Q1, ok: true });
    expect(s.records[0]!.picked).toEqual(["4p", "5p", "6p"]);
  });

  it("SUBMIT_CHINITSU: 一部だけの選択は不正解（出題数だけ増える）", () => {
    const { state: started, ctx } = startRunning("chinitsu", [CHINITSU_Q1, CHINITSU_Q2]);
    let s = started;
    s = quizSessionReducer(s, { type: "TOGGLE_WAIT", tile: "4p" }, ctx);
    s = quizSessionReducer(s, { type: "SUBMIT_CHINITSU" }, ctx);
    expect(s.total).toBe(1);
    expect(s.correct).toBe(0);
    expect(s.feedback).toBe("ng");
    expect(s.records[0]).toMatchObject({ ok: false });
  });

  it("SUBMIT_CHINITSU: 未選択（picked 空）では回答にならない", () => {
    const { state, ctx } = startRunning("chinitsu", [CHINITSU_Q1]);
    const s = quizSessionReducer(state, { type: "SUBMIT_CHINITSU" }, ctx);
    expect(s.total).toBe(0);
    expect(s.feedback).toBeNull();
  });

  it("フィードバック表示中は TOGGLE_WAIT / 再回答を受け付けない", () => {
    const { state: started, ctx } = startRunning("chinitsu", [CHINITSU_Q1, CHINITSU_Q2]);
    let s = started;
    s = quizSessionReducer(s, { type: "TOGGLE_WAIT", tile: "4p" }, ctx);
    s = quizSessionReducer(s, { type: "SUBMIT_CHINITSU" }, ctx);
    const graded = s;
    s = quizSessionReducer(s, { type: "TOGGLE_WAIT", tile: "5p" }, ctx);
    s = quizSessionReducer(s, { type: "SUBMIT_CHINITSU" }, ctx);
    expect(s).toBe(graded);
    expect(s.total).toBe(1);
  });

  it.each([
    { name: "正解打牌（answer に含まれる）", tile: "9s" as Tile, ok: true },
    { name: "不正解打牌", tile: "3m" as Tile, ok: false },
  ])("DISCARD: $name → correct=$ok", ({ tile, ok }) => {
    const { state: started, ctx } = startRunning("efficiency", [EFFICIENCY_Q1]);
    let s = started;
    s = quizSessionReducer(s, { type: "DISCARD", tile }, ctx);
    expect(s.total).toBe(1);
    expect(s.correct).toBe(ok ? 1 : 0);
    expect(s.feedback).toBe(ok ? "ok" : "ng");
    expect(s.records[0]!.picked).toEqual([tile]);
  });

  it.each([
    { name: "正解の選択肢", choice: "3900点", ok: true },
    { name: "不正解の選択肢", choice: "7700点", ok: false },
  ])("CHOOSE_SCORE: $name → correct=$ok", ({ choice, ok }) => {
    const { state: started, ctx } = startRunning("score", [SCORE_Q1]);
    let s = started;
    s = quizSessionReducer(s, { type: "CHOOSE_SCORE", choice }, ctx);
    expect(s.total).toBe(1);
    expect(s.correct).toBe(ok ? 1 : 0);
    expect(s.records[0]).toMatchObject({ pickedChoice: choice, ok });
    expect(s.records[0]!.picked).toEqual([]);
  });

  it("FEEDBACK_DONE で次問へ進み、picked と feedback がリセットされる", () => {
    const { state: started, ctx } = startRunning("chinitsu", [CHINITSU_Q1, CHINITSU_Q2]);
    let s = started;
    s = quizSessionReducer(s, { type: "TOGGLE_WAIT", tile: "4p" }, ctx);
    s = quizSessionReducer(s, { type: "SUBMIT_CHINITSU" }, ctx);
    s = quizSessionReducer(s, { type: "FEEDBACK_DONE" }, ctx);
    expect(s.question).toEqual(CHINITSU_Q2);
    expect(s.picked).toEqual([]);
    expect(s.feedback).toBeNull();
    expect(s.total).toBe(1); // スコアは持ち越す
  });
});

describe("quizSessionReducer: 実時刻タイマーと時間切れ", () => {
  it("TIMER_TICK は deadline との差から残り秒を計算する（tick 遅延でも実時刻でずれない）", () => {
    const { state, ctx, runStart } = startRunning("chinitsu", [CHINITSU_Q1]);
    let s = quizSessionReducer(state, { type: "TIMER_TICK", now: runStart + 1000 }, ctx);
    expect(s.secondsLeft).toBe(59);
    // tick が 2.4 秒遅れて届いても now 基準で計算する（内部カウンタの引き算ではない）。
    s = quizSessionReducer(s, { type: "TIMER_TICK", now: runStart + 3400 }, ctx);
    expect(s.secondsLeft).toBe(57); // ceil((60000-3400)/1000)
    expect(s.phase).toBe("running");
  });

  it("deadline 到達で result になり、回答中だった問題は records に入らない", () => {
    const { state: started, ctx, runStart } = startRunning("efficiency", [EFFICIENCY_Q1]);
    let s = started;
    s = quizSessionReducer(s, { type: "DISCARD", tile: "9s" }, ctx); // Q1 回答
    s = quizSessionReducer(s, { type: "FEEDBACK_DONE" }, ctx); // Q2 出題（回答しない）
    s = quizSessionReducer(s, { type: "TIMER_TICK", now: runStart + 60_000 }, ctx);
    expect(s.phase).toBe("result");
    expect(s.secondsLeft).toBe(0);
    expect(s.records).toHaveLength(1); // 打ち切られた Q2 は含めない
    expect(s.total).toBe(1);
  });

  it("フィードバック表示中に時間切れになっても result になり、遅れて届く FEEDBACK_DONE は無視する", () => {
    const { state: started, ctx, runStart } = startRunning("efficiency", [EFFICIENCY_Q1]);
    let s = started;
    s = quizSessionReducer(s, { type: "DISCARD", tile: "9s" }, ctx);
    expect(s.feedback).toBe("ok");
    s = quizSessionReducer(s, { type: "TIMER_TICK", now: runStart + 60_000 }, ctx);
    expect(s.phase).toBe("result");
    const result = s;
    s = quizSessionReducer(s, { type: "FEEDBACK_DONE" }, ctx);
    expect(s).toBe(result); // 前セッションの残タイマーが新しい画面を汚さない
  });

  it("RETRY は同じ種目でカウントダウンから再開し、スコア・見直し・sessionId を新しくする", () => {
    const { state: started, ctx, runStart } = startRunning("efficiency", [EFFICIENCY_Q1]);
    let s = started;
    s = quizSessionReducer(s, { type: "DISCARD", tile: "9s" }, ctx);
    s = quizSessionReducer(s, { type: "TIMER_TICK", now: runStart + 60_000 }, ctx);
    s = quizSessionReducer(s, { type: "RETRY", sessionId: "qs2", now: runStart + 70_000 }, ctx);
    expect(s.phase).toBe("countdown");
    expect(s.countdown).toBe(3);
    expect(s.kind).toBe("efficiency");
    expect(s.sessionId).toBe("qs2");
    expect(s.total).toBe(0);
    expect(s.correct).toBe(0);
    expect(s.records).toEqual([]);
    expect(s.durationMs).toBeNull();
  });

  it("BACK_TO_SELECT で種目選択に戻る（result からのみ）", () => {
    const { state: started, ctx, runStart } = startRunning("chinitsu", [CHINITSU_Q1]);
    let s = started;
    const running = s;
    // running 中は無視（誤 dispatch に対する防御）。
    expect(quizSessionReducer(running, { type: "BACK_TO_SELECT" }, ctx)).toBe(running);
    s = quizSessionReducer(s, { type: "TIMER_TICK", now: runStart + 60_000 }, ctx);
    s = quizSessionReducer(s, { type: "BACK_TO_SELECT" }, ctx);
    expect(s.phase).toBe("select");
    expect(s.question).toBeNull();
    expect(s.pendingKind).toBeNull();
  });
});

describe("sessionResult: durationMs の一意な計算（ドリフト根治）", () => {
  it("tick が正確なら durationMs は sessionSeconds*1000 ちょうど", () => {
    const { state: started, ctx, runStart } = startRunning("efficiency", [EFFICIENCY_Q1]);
    let s = started;
    s = quizSessionReducer(s, { type: "DISCARD", tile: "9s" }, ctx);
    s = quizSessionReducer(s, { type: "TIMER_TICK", now: runStart + 60_000 }, ctx);
    expect(sessionResult(s)).toEqual({
      kind: "efficiency",
      total: 1,
      correct: 1,
      durationMs: 60_000,
    });
    expect(() => QuizResultSchema.parse(sessionResult(s))).not.toThrow();
  });

  it("dev 短縮秒（sessionSeconds=1）でも実測どおり 1000ms が記録される", () => {
    const { state, ctx, runStart } = startRunning("efficiency", [EFFICIENCY_Q1], {
      sessionSeconds: 1,
      countdownSeconds: 0,
    });
    const s = quizSessionReducer(state, { type: "TIMER_TICK", now: runStart + 1000 }, ctx);
    expect(s.phase).toBe("result");
    expect(sessionResult(s).durationMs).toBe(1000);
  });

  it("最後の tick が遅延しても durationMs は sessionSeconds*1000+スラック で clamp される", () => {
    const { state, ctx, runStart } = startRunning("efficiency", [EFFICIENCY_Q1]);
    // タブのバックグラウンド等で 3 秒遅れて終了 tick が届いた場合。
    const s = quizSessionReducer(state, { type: "TIMER_TICK", now: runStart + 63_000 }, ctx);
    expect(s.phase).toBe("result");
    expect(sessionResult(s).durationMs).toBe(60_000 + QUIZ_DURATION_SLACK_MS);
    expect(() => QuizResultSchema.parse(sessionResult(s))).not.toThrow();
  });

  it("QuizResultSchema の上限 120000 を超えない（長い sessionSeconds を注入しても clamp）", () => {
    const { state, ctx, runStart } = startRunning("efficiency", [EFFICIENCY_Q1], {
      sessionSeconds: 150,
      countdownSeconds: 0,
    });
    const s = quizSessionReducer(state, { type: "TIMER_TICK", now: runStart + 200_000 }, ctx);
    expect(sessionResult(s).durationMs).toBe(120_000);
    expect(() => QuizResultSchema.parse(sessionResult(s))).not.toThrow();
  });
});

describe("defaultQuizQuestion: 種目→生成器の配線", () => {
  it.each([
    { kind: "chinitsu" as const, direct: generateChinitsuQuestion },
    { kind: "efficiency" as const, direct: generateEfficiencyQuestion },
    { kind: "score" as const, direct: generateScoreQuestion },
  ])("$kind は既存の生成器と同一シードで同一問題を返す", ({ kind, direct }) => {
    // 期待値は既存生成器の直接呼び出し（値の焼き付けをしない）。
    const viaDefault = defaultQuizQuestion(kind, createQuizRng(123));
    expect(viaDefault.kind).toBe(kind);
    expect(viaDefault).toEqual(direct(createQuizRng(123)));
  });
});

describe("清一色 何切る（DISCARD を牌効率と同じ経路で採点する）", () => {
  // 1112244557788m: 順子が作れない6種・6対子＋1枚。9m を足した14枚から1枚切る。
  const CHINITSU_UKEIRE_Q1: ChinitsuUkeireQuestion = {
    kind: "chinitsuUkeire",
    // prettier-ignore
    tiles: ["1m", "1m", "1m", "2m", "2m", "4m", "4m", "5m", "5m", "7m", "7m", "8m", "8m", "9m"],
    suit: "m",
    shanten: 1,
    answer: ["1m"],
  };

  it.each([
    { name: "正解打牌（answer に含まれる）", tile: "1m" as Tile, ok: true },
    { name: "不正解打牌", tile: "9m" as Tile, ok: false },
  ])("DISCARD: $name → correct=$ok", ({ tile, ok }) => {
    const { state: started, ctx } = startRunning("chinitsuUkeire", [CHINITSU_UKEIRE_Q1]);
    let s = started;
    s = quizSessionReducer(s, { type: "DISCARD", tile }, ctx);
    expect(s.total).toBe(1);
    expect(s.correct).toBe(ok ? 1 : 0);
    expect(s.records[0]!.picked).toEqual([tile]);
  });

  it("defaultQuizQuestion は清一色 何切るを生成する（種目→生成器の配線）", () => {
    const q = defaultQuizQuestion("chinitsuUkeire", createQuizRng(20260726));
    expect(q.kind).toBe("chinitsuUkeire");
  });
});
