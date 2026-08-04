// 特訓クイズのユースケース。
//   - 開始: 無料は同一 JST 日に FREE_QUIZ_PER_DAY 回まで（開始時に1回消費。超過は
//     quota_exceeded=402）。JST 0時（UTC 15:00）を跨ぐと回復。有料（next/pro）は
//     無制限（remainingToday: null）。
//   - 完了: QuizResultSchema を通った結果だけを自分の行に書く（他人・不存在は not_found）。
//   - 履歴: 本人の完了済みセッションのみ（未完了の放棄行は除く）。

import {
  FREE_QUIZ_PER_DAY,
  type QuizAnswerRecord,
  type QuizKind,
  type QuizSubmittedAnswer,
} from "@rigel/schema";
import { describe, expect, it, vi } from "vitest";
import { makeFreeUser } from "../test-support/billing";
import { InMemoryQuizSessionRepository, InMemoryUserRepository } from "../test-support/in-memory";
import {
  FinishQuizSession,
  GetQuizRanking,
  GetQuizSession,
  ListQuizSessions,
  StartQuizSession,
} from "./quiz.usecase";

/** JST 2026-07-24 の昼（UTC 03:00）。 */
const NOON = new Date("2026-07-24T03:00:00.000Z");

/** リプレイの固定出題（中身の正しさは @rigel/ui replayQuizAnswers のテストが担保。
 *  ここでは「9s を切ったら正解」という決めの採点だけを担う）。 */
const REPLAY_Q = {
  kind: "efficiency",
  // prettier-ignore
  tiles: ["3m", "3m", "5m", "7m", "3p", "5p", "6p", "7p", "8p", "6s", "7s", "9s", "4z", "7z"],
  shanten: 2,
  answer: ["9s"],
} as const;

function makeDeps(plan: "free" | "next" | "pro" = "free") {
  const user = makeFreeUser("u1");
  if (plan !== "free") user.changePlan(plan);
  const users = new InMemoryUserRepository([user]);
  const sessions = new InMemoryQuizSessionRepository();
  let seq = 0;
  let now = NOON;
  // シードリプレイ再採点のスタブ（本物は @rigel/ui replayQuizAnswers を配線）。
  const replay = vi.fn((_kind: QuizKind, _seed: number, answers: readonly QuizSubmittedAnswer[]) =>
    answers.map((a): QuizAnswerRecord => ({
      question: { ...REPLAY_Q, tiles: [...REPLAY_Q.tiles], answer: [...REPLAY_Q.answer] },
      picked: [...a.picked],
      ...(a.choice === undefined ? {} : { pickedChoice: a.choice }),
      ok: a.picked[0] === "9s",
    })),
  );
  const deps = {
    users,
    sessions,
    now: () => now,
    newId: () => `q${++seq}`,
    newSeed: () => 123,
  };
  return {
    sessions,
    replay,
    start: new StartQuizSession(deps),
    finish: new FinishQuizSession({
      users,
      sessions,
      now: () => now,
      engineVersion: 1,
      replay,
    }),
    get: new GetQuizSession({ users, sessions }),
    ranking: new GetQuizRanking({ sessions, now: () => now }),
    list: new ListQuizSessions({ sessions }),
    setNow: (d: Date) => {
      now = d;
    },
  };
}

const RESULT = { kind: "chinitsu", total: 10, correct: 7, durationMs: 61_000 };

describe("StartQuizSession（開始 = 消費）", () => {
  it("free は同一 JST 日に FREE_QUIZ_PER_DAY 回まで開始でき、remainingToday が 9→…→0 と減る", async () => {
    const { start } = makeDeps("free");
    for (let remaining = FREE_QUIZ_PER_DAY - 1; remaining >= 0; remaining--) {
      const r = await start.execute({ userId: "u1", kind: "chinitsu" });
      expect(r).toEqual({ ok: true, id: expect.any(String), seed: 123, remainingToday: remaining });
    }
  });

  it("free の開始1回あたり回数カウントは1回だけ読む（INSERT 後の再カウント=D1 二度読みをしない。remainingToday は開始前カウント+1 から算出）", async () => {
    const { start, sessions } = makeDeps("free");
    const spy = vi.spyOn(sessions, "countByUserAndDay");
    const r = await start.execute({ userId: "u1", kind: "chinitsu" });
    expect(r).toEqual({
      ok: true,
      id: expect.any(String),
      seed: 123,
      remainingToday: FREE_QUIZ_PER_DAY - 1,
    });
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it("free の上限+1回目は quota_exceeded（行も増えない）", async () => {
    const { start, sessions } = makeDeps("free");
    for (let i = 0; i < FREE_QUIZ_PER_DAY; i++)
      await start.execute({ userId: "u1", kind: "chinitsu" });
    const r = await start.execute({ userId: "u1", kind: "efficiency" });
    expect(r).toEqual({ ok: false, reason: "quota_exceeded" });
    expect(sessions.rows).toHaveLength(FREE_QUIZ_PER_DAY);
  });

  it("JST 境界: UTC 14:59 までは同日で拒否・UTC 15:00（JST 0時）を跨ぐと回復する", async () => {
    const { start, setNow } = makeDeps("free");
    for (let i = 0; i < FREE_QUIZ_PER_DAY; i++)
      await start.execute({ userId: "u1", kind: "chinitsu" });
    setNow(new Date("2026-07-24T14:59:59.999Z")); // JST 7/24 23:59
    expect((await start.execute({ userId: "u1", kind: "chinitsu" })).ok).toBe(false);
    setNow(new Date("2026-07-24T15:00:00.000Z")); // JST 7/25 0:00
    const r = await start.execute({ userId: "u1", kind: "chinitsu" });
    expect(r).toEqual({
      ok: true,
      id: expect.any(String),
      seed: 123,
      remainingToday: FREE_QUIZ_PER_DAY - 1,
    });
  });

  it.each([["next"], ["pro"]] as const)(
    "有料（%s）は上限を超えても開始でき、remainingToday は null（無制限）",
    async (plan) => {
      const { start } = makeDeps(plan);
      for (let i = 0; i < FREE_QUIZ_PER_DAY + 1; i++) {
        const r = await start.execute({ userId: "u1", kind: "efficiency" });
        expect(r).toEqual({ ok: true, id: expect.any(String), seed: 123, remainingToday: null });
      }
    },
  );

  it("kind=score（点数計算 [決定] 2026-07-26 追加）でも開始できる", async () => {
    const { start, sessions } = makeDeps("free");
    const r = await start.execute({ userId: "u1", kind: "score" });
    expect(r).toEqual({
      ok: true,
      id: expect.any(String),
      seed: 123,
      remainingToday: FREE_QUIZ_PER_DAY - 1,
    });
    expect(sessions.rows[0]).toMatchObject({ kind: "score" });
  });

  it("不正な kind は invalid（行を作らない）", async () => {
    const { start, sessions } = makeDeps("free");
    const r = await start.execute({ userId: "u1", kind: "speed" });
    expect(r).toEqual({ ok: false, reason: "invalid" });
    expect(sessions.rows).toHaveLength(0);
  });

  it("開始した行は結果が null（開始時消費・未完了として残る）", async () => {
    const { start, sessions } = makeDeps("free");
    await start.execute({ userId: "u1", kind: "chinitsu" });
    expect(sessions.rows[0]).toMatchObject({
      userId: "u1",
      kind: "chinitsu",
      startedDay: "2026-07-24",
      total: null,
      correct: null,
      durationMs: null,
    });
  });
});

describe("FinishQuizSession（完了 = 結果の記録）", () => {
  async function started() {
    const d = makeDeps("free");
    const r = await d.start.execute({ userId: "u1", kind: "chinitsu" });
    if (!r.ok) throw new Error("開始に失敗");
    return { ...d, sessionId: r.id };
  }

  it("QuizResultSchema を通った結果を自分の行に書く", async () => {
    const { finish, sessions, sessionId } = await started();
    const r = await finish.execute({ userId: "u1", sessionId, result: RESULT });
    expect(r).toEqual({ ok: true });
    expect(sessions.rows[0]).toMatchObject({ total: 10, correct: 7, durationMs: 61_000 });
  });

  it("correct > total は invalid（スキーマ違反を保存しない）", async () => {
    const { finish, sessions, sessionId } = await started();
    const r = await finish.execute({
      userId: "u1",
      sessionId,
      result: { ...RESULT, total: 3, correct: 4 },
    });
    expect(r).toEqual({ ok: false, reason: "invalid" });
    expect(sessions.rows[0]!.total).toBeNull();
  });

  it("他人の行は not_found（存在を伏せる）", async () => {
    const { finish, sessionId } = await started();
    const r = await finish.execute({ userId: "u2", sessionId, result: RESULT });
    expect(r).toEqual({ ok: false, reason: "not_found" });
  });

  it("存在しない行は not_found", async () => {
    const { finish } = await started();
    const r = await finish.execute({ userId: "u1", sessionId: "missing", result: RESULT });
    expect(r).toEqual({ ok: false, reason: "not_found" });
  });

  it("開始時の kind と異なる結果は invalid（行の kind は開始時に確定）", async () => {
    const { finish, sessionId } = await started();
    const r = await finish.execute({
      userId: "u1",
      sessionId,
      result: { ...RESULT, kind: "efficiency" },
    });
    expect(r).toEqual({ ok: false, reason: "invalid" });
  });

  it("二重送信は最後勝ち（再送で上書きできる）", async () => {
    const { finish, sessions, sessionId } = await started();
    await finish.execute({ userId: "u1", sessionId, result: RESULT });
    const r = await finish.execute({
      userId: "u1",
      sessionId,
      result: { ...RESULT, total: 12, correct: 9 },
    });
    expect(r).toEqual({ ok: true });
    expect(sessions.rows[0]).toMatchObject({ total: 12, correct: 9 });
  });
});

describe("StartQuizSession: サーバ発行シード（Plan: quiz-open-and-ranking Phase 4）", () => {
  it("開始はシードを発行して行に保存し、レスポンスで返す（verified=false・records=null で始まる）", async () => {
    const { start, sessions } = makeDeps("free");
    const r = await start.execute({ userId: "u1", kind: "chinitsu" });
    expect(r).toMatchObject({ ok: true, seed: 123 });
    expect(sessions.rows[0]).toMatchObject({ seed: 123, verified: false, records: null });
  });
});

describe("FinishQuizSession: シードリプレイ再採点（verified）と有料フル保存", () => {
  /** 全回答つきの完了ペイロード（申告 correct=2 は水増し。サーバ採点では 9s のみ正解=1）。 */
  const FULL = {
    kind: "chinitsu",
    total: 2,
    correct: 2,
    durationMs: 61_000,
    engineVersion: 1,
    answers: [{ picked: ["9s"] }, { picked: ["1m"] }],
  };

  /** 開始 → elapsedMs 進めて完了。 */
  async function startAndFinish(plan: "free" | "next" | "pro", body: unknown, elapsedMs = 61_000) {
    const d = makeDeps(plan);
    const s = await d.start.execute({ userId: "u1", kind: "chinitsu" });
    if (!s.ok) throw new Error("開始に失敗");
    d.setNow(new Date(NOON.getTime() + elapsedMs));
    const r = await d.finish.execute({ userId: "u1", sessionId: s.id, result: body });
    return { ...d, sessionId: s.id, r };
  }

  it("全回答つきはサーバ再採点の値で確定し verified になる（申告 correct は使わない）", async () => {
    const { r, sessions, replay } = await startAndFinish("free", FULL);
    expect(r).toEqual({ ok: true });
    expect(replay).toHaveBeenCalledWith("chinitsu", 123, FULL.answers);
    // 申告は correct=2 だがサーバ採点は 1（9s のみ正解）。
    expect(sessions.rows[0]).toMatchObject({ total: 2, correct: 1, verified: true });
  });

  it("無料は records を保存しない（検証に使って捨てる）", async () => {
    const { sessions } = await startAndFinish("free", FULL);
    expect(sessions.rows[0]!.records).toBeNull();
  });

  it.each([["next"], ["pro"]] as const)("有料（%s）は records を保存する", async (plan) => {
    const { sessions } = await startAndFinish(plan, FULL);
    expect(sessions.rows[0]!.records).toHaveLength(2);
    expect(sessions.rows[0]!.records![0]).toMatchObject({ picked: ["9s"], ok: true });
    expect(sessions.rows[0]!.records![0]!.question).toMatchObject({ kind: "efficiency" });
  });

  it("エンジン版数不一致はリプレイせず申告値のまま unverified（records なし）", async () => {
    const { sessions, replay } = await startAndFinish("next", {
      ...FULL,
      engineVersion: 2,
    });
    expect(replay).not.toHaveBeenCalled();
    expect(sessions.rows[0]).toMatchObject({
      total: 2,
      correct: 2,
      verified: false,
      records: null,
    });
  });

  it("旧クライアント（answers なし）は申告値のまま unverified", async () => {
    const { sessions } = await startAndFinish("next", {
      kind: "chinitsu",
      total: 10,
      correct: 7,
      durationMs: 61_000,
    });
    expect(sessions.rows[0]).toMatchObject({
      total: 10,
      correct: 7,
      verified: false,
      records: null,
    });
  });

  it("開始から60秒未満の完了は unverified（実時間のサーバ強制。有料の records は残す）", async () => {
    const { sessions } = await startAndFinish("next", FULL, 59_000);
    expect(sessions.rows[0]).toMatchObject({ total: 2, correct: 1, verified: false });
    expect(sessions.rows[0]!.records).toHaveLength(2);
  });

  it("answers.length !== total は invalid（背骨ゲート）", async () => {
    const { r } = await startAndFinish("free", { ...FULL, total: 3, correct: 3 });
    expect(r).toEqual({ ok: false, reason: "invalid" });
  });

  it("verified で確定した行への再 PATCH は 200 の no-op（オフライン解答での差し替えを塞ぐ）", async () => {
    const d = await startAndFinish("free", FULL);
    expect(d.sessions.rows[0]).toMatchObject({ correct: 1, verified: true });
    // 全問正解の回答に差し替えて再送しても、行は変わらない（リトライは 200 で受ける）。
    const r = await d.finish.execute({
      userId: "u1",
      sessionId: d.sessionId,
      result: { ...FULL, answers: [{ picked: ["9s"] }, { picked: ["9s"] }] },
    });
    expect(r).toEqual({ ok: true });
    expect(d.sessions.rows[0]).toMatchObject({ correct: 1, verified: true });
    expect(d.replay).toHaveBeenCalledTimes(1); // 再リプレイもしない
  });

  it("durationMs はサーバ実測経過で上限を切る（申告がサーバ経過より長いことはあり得ない）", async () => {
    const { sessions } = await startAndFinish(
      "free",
      { ...FULL, durationMs: 120_000 },
      61_000, // サーバ実測は61秒
    );
    expect(sessions.rows[0]!.durationMs).toBe(61_000);
  });
});

describe("GetQuizSession（詳細は本人のみ。records は現在の plan が有料のときだけ）", () => {
  const FULL = {
    kind: "chinitsu",
    total: 1,
    correct: 1,
    durationMs: 61_000,
    engineVersion: 1,
    answers: [{ picked: ["9s"] }],
  };

  async function completed(plan: "free" | "next" | "pro") {
    const d = makeDeps(plan);
    const s = await d.start.execute({ userId: "u1", kind: "chinitsu" });
    if (!s.ok) throw new Error("開始に失敗");
    d.setNow(new Date(NOON.getTime() + 61_000));
    await d.finish.execute({ userId: "u1", sessionId: s.id, result: FULL });
    return { ...d, sessionId: s.id };
  }

  it("有料は records つきで返す", async () => {
    const { get, sessionId } = await completed("next");
    const r = await get.execute({ userId: "u1", sessionId });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.session).toMatchObject({ id: sessionId, total: 1, correct: 1 });
      expect(r.records).toHaveLength(1);
    }
  });

  it("ダウングレード後は records を返さない（行は保持=再アップグレードで復活）", async () => {
    const { sessionId, sessions } = await completed("next");
    // ダウングレード相当: 保存済みの行はそのままに、現在プラン free の users で閲覧する。
    const getAsFree = new GetQuizSession({
      users: new InMemoryUserRepository([makeFreeUser("u1")]),
      sessions,
    });
    const r = await getAsFree.execute({ userId: "u1", sessionId });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.records).toBeNull();
      expect(sessions.rows[0]!.records).toHaveLength(1); // 行のデータは消えていない
    }
  });

  it("他人・不存在・未完了は not_found（存在を伏せる）", async () => {
    const { get, sessionId, start } = await completed("next");
    expect(await get.execute({ userId: "u2", sessionId })).toEqual({
      ok: false,
      reason: "not_found",
    });
    expect(await get.execute({ userId: "u1", sessionId: "missing" })).toEqual({
      ok: false,
      reason: "not_found",
    });
    const pending = await start.execute({ userId: "u1", kind: "chinitsu" });
    if (!pending.ok) throw new Error("開始に失敗");
    expect(await get.execute({ userId: "u1", sessionId: pending.id })).toEqual({
      ok: false,
      reason: "not_found",
    });
  });
});

describe("GetQuizRanking（verified のみ・期間窓・匿名可。Plan 4-2）", () => {
  /** verified/unverified の完了行を直接仕込む（作り方は Finish のテストが担保済み）。 */
  function seedRows(deps: ReturnType<typeof makeDeps>) {
    const base = {
      kind: "chinitsu" as const,
      startedDay: "2026-07-24",
      seed: 1,
      durationMs: 60_000,
      records: null,
      createdAt: NOON,
    };
    deps.sessions.rows.push(
      { ...base, id: "a1", userId: "u1", total: 10, correct: 7, verified: true },
      { ...base, id: "a2", userId: "u1", total: 10, correct: 5, verified: true },
      // 申告のみ（unverified）はランキングに載らない。
      { ...base, id: "a3", userId: "u2", total: 10, correct: 10, verified: false },
      // 別種目は混ざらない。
      {
        ...base,
        id: "a4",
        userId: "u3",
        kind: "efficiency",
        total: 10,
        correct: 9,
        verified: true,
      },
      // 週間窓の外（JST 7/20 月曜 0:00 より前）。
      {
        ...base,
        id: "a5",
        userId: "u4",
        total: 10,
        correct: 10,
        verified: true,
        createdAt: new Date("2026-07-18T03:00:00.000Z"),
      },
    );
  }

  it("verified セッションだけをユーザ単位に合算し、別種目・申告のみの行は載せない（全期間）", async () => {
    const d = makeDeps();
    seedRows(d);
    const r = await d.ranking.execute({ kind: "chinitsu", period: "all", viewerId: null });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.correct.map((e) => [e.handle, e.correct, e.total])).toEqual([
        ["@u1", 12, 20], // 7+5 / 10+10
        ["@u4", 10, 10],
      ]);
      expect(r.me).toBeNull();
    }
  });

  it("weekly は JST 月曜 0:00 起点の窓の外を含めない", async () => {
    const d = makeDeps(); // now = NOON = JST 金曜 7/24
    seedRows(d);
    const r = await d.ranking.execute({ kind: "chinitsu", period: "weekly", viewerId: null });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.correct.map((e) => e.handle)).toEqual(["@u1"]); // u4 は 7/18（先週）
  });

  it("monthly は JST 月初 0:00 起点の窓で、前月分を含めない", async () => {
    const d = makeDeps(); // now = NOON = JST 7/24
    seedRows(d);
    // 前月末（JST 6/30）の verified 行は月間に載らない。
    d.sessions.rows.push({
      kind: "chinitsu",
      startedDay: "2026-06-30",
      seed: 1,
      durationMs: 60_000,
      records: null,
      id: "a6",
      userId: "u5",
      total: 10,
      correct: 10,
      verified: true,
      createdAt: new Date("2026-06-30T03:00:00.000Z"),
    });
    const r = await d.ranking.execute({ kind: "chinitsu", period: "monthly", viewerId: null });
    expect(r.ok).toBe(true);
    if (r.ok) {
      const handles = r.correct.map((e) => e.handle);
      expect(handles).toContain("@u1"); // 7/24（今月）
      expect(handles).toContain("@u4"); // 7/18（今月・週間窓の外）
      expect(handles).not.toContain("@u5"); // 6/30（前月）
    }
  });

  it("viewerId を渡すと自分の順位（me）が付く", async () => {
    const d = makeDeps();
    seedRows(d);
    const r = await d.ranking.execute({ kind: "chinitsu", period: "all", viewerId: "u4" });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.me).toMatchObject({ correctRank: 2, correct: 10, total: 10 });
  });

  it.each([
    { name: "不正な kind", params: { kind: "speed", period: "all" } },
    { name: "不正な period", params: { kind: "chinitsu", period: "daily" } },
  ])("$name は invalid", async ({ params }) => {
    const d = makeDeps();
    expect(await d.ranking.execute({ ...params, viewerId: null })).toEqual({
      ok: false,
      reason: "invalid",
    });
  });
});

describe("ListQuizSessions（履歴は本人の完了済みのみ）", () => {
  it("未完了（放棄）行は含めず、本人の完了済みだけを返す", async () => {
    const { start, finish, list } = makeDeps("free");
    const r1 = await start.execute({ userId: "u1", kind: "chinitsu" });
    await start.execute({ userId: "u1", kind: "efficiency" }); // 放棄（未完了）
    if (!r1.ok) throw new Error("開始に失敗");
    await finish.execute({ userId: "u1", sessionId: r1.id, result: RESULT });

    const got = await list.execute({ userId: "u1" });
    expect(got).toEqual({
      ok: true,
      sessions: [expect.objectContaining({ id: r1.id, kind: "chinitsu", total: 10, correct: 7 })],
    });
    // 他人（u2）からは見えない。
    expect(await list.execute({ userId: "u2" })).toEqual({ ok: true, sessions: [] });
  });

  it("since 以降だけ返す（ISO8601）", async () => {
    const { start, finish, list, setNow } = makeDeps("free");
    const old = await start.execute({ userId: "u1", kind: "chinitsu" });
    if (!old.ok) throw new Error("開始に失敗");
    await finish.execute({ userId: "u1", sessionId: old.id, result: RESULT });

    setNow(new Date("2026-07-26T03:00:00.000Z"));
    const recent = await start.execute({ userId: "u1", kind: "chinitsu" });
    if (!recent.ok) throw new Error("開始に失敗");
    await finish.execute({ userId: "u1", sessionId: recent.id, result: RESULT });

    const got = await list.execute({ userId: "u1", since: "2026-07-25T00:00:00.000Z" });
    expect(got.ok).toBe(true);
    if (got.ok) expect(got.sessions.map((s) => s.id)).toEqual([recent.id]);
  });

  it("不正な since は invalid", async () => {
    const { list } = makeDeps("free");
    expect(await list.execute({ userId: "u1", since: "not-a-date" })).toEqual({
      ok: false,
      reason: "invalid",
    });
  });
});
