// 特訓クイズのユースケース。
//   - 開始: 無料は同一 JST 日に 3 回まで（開始時に1回消費。4回目は quota_exceeded=402）。
//     JST 0時（UTC 15:00）を跨ぐと回復。有料（next/pro）は無制限（remainingToday: null）。
//   - 完了: QuizResultSchema を通った結果だけを自分の行に書く（他人・不存在は not_found）。
//   - 履歴: 本人の完了済みセッションのみ（未完了の放棄行は除く）。

import { describe, expect, it, vi } from "vitest";
import { makeFreeUser } from "../test-support/billing";
import { InMemoryQuizSessionRepository, InMemoryUserRepository } from "../test-support/in-memory";
import { FinishQuizSession, ListQuizSessions, StartQuizSession } from "./quiz.usecase";

/** JST 2026-07-24 の昼（UTC 03:00）。 */
const NOON = new Date("2026-07-24T03:00:00.000Z");

function makeDeps(plan: "free" | "next" | "pro" = "free") {
  const user = makeFreeUser("u1");
  if (plan !== "free") user.changePlan(plan);
  const users = new InMemoryUserRepository([user]);
  const sessions = new InMemoryQuizSessionRepository();
  let seq = 0;
  let now = NOON;
  const deps = {
    users,
    sessions,
    now: () => now,
    newId: () => `q${++seq}`,
  };
  return {
    sessions,
    start: new StartQuizSession(deps),
    finish: new FinishQuizSession({ sessions }),
    list: new ListQuizSessions({ sessions }),
    setNow: (d: Date) => {
      now = d;
    },
  };
}

const RESULT = { kind: "chinitsu", total: 10, correct: 7, durationMs: 61_000 };

describe("StartQuizSession（開始 = 消費）", () => {
  it("free は同一 JST 日に3回まで開始でき、remainingToday が 2→1→0 と減る", async () => {
    const { start } = makeDeps("free");
    for (const remaining of [2, 1, 0]) {
      const r = await start.execute({ userId: "u1", kind: "chinitsu" });
      expect(r).toEqual({ ok: true, id: expect.any(String), remainingToday: remaining });
    }
  });

  it("free の開始1回あたり回数カウントは1回だけ読む（INSERT 後の再カウント=D1 二度読みをしない。remainingToday は開始前カウント+1 から算出）", async () => {
    const { start, sessions } = makeDeps("free");
    const spy = vi.spyOn(sessions, "countByUserAndDay");
    const r = await start.execute({ userId: "u1", kind: "chinitsu" });
    expect(r).toEqual({ ok: true, id: expect.any(String), remainingToday: 2 });
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it("free の4回目は quota_exceeded（行も増えない）", async () => {
    const { start, sessions } = makeDeps("free");
    for (let i = 0; i < 3; i++) await start.execute({ userId: "u1", kind: "chinitsu" });
    const r = await start.execute({ userId: "u1", kind: "efficiency" });
    expect(r).toEqual({ ok: false, reason: "quota_exceeded" });
    expect(sessions.rows).toHaveLength(3);
  });

  it("JST 境界: UTC 14:59 までは同日で拒否・UTC 15:00（JST 0時）を跨ぐと回復する", async () => {
    const { start, setNow } = makeDeps("free");
    for (let i = 0; i < 3; i++) await start.execute({ userId: "u1", kind: "chinitsu" });
    setNow(new Date("2026-07-24T14:59:59.999Z")); // JST 7/24 23:59
    expect((await start.execute({ userId: "u1", kind: "chinitsu" })).ok).toBe(false);
    setNow(new Date("2026-07-24T15:00:00.000Z")); // JST 7/25 0:00
    const r = await start.execute({ userId: "u1", kind: "chinitsu" });
    expect(r).toEqual({ ok: true, id: expect.any(String), remainingToday: 2 });
  });

  it.each([["next"], ["pro"]] as const)(
    "有料（%s）は4回目以降も開始でき、remainingToday は null（無制限）",
    async (plan) => {
      const { start } = makeDeps(plan);
      for (let i = 0; i < 4; i++) {
        const r = await start.execute({ userId: "u1", kind: "efficiency" });
        expect(r).toEqual({ ok: true, id: expect.any(String), remainingToday: null });
      }
    },
  );

  it("kind=score（点数計算 [決定] 2026-07-26 追加）でも開始できる", async () => {
    const { start, sessions } = makeDeps("free");
    const r = await start.execute({ userId: "u1", kind: "score" });
    expect(r).toEqual({ ok: true, id: expect.any(String), remainingToday: 2 });
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
