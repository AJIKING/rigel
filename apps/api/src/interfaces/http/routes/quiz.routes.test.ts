// /quiz/sessions の HTTP 統合テスト（ルート → 実ユースケース → 実 Drizzle リポジトリ(sql.js)）。
// 無料 1日 FREE_QUIZ_PER_DAY 回のサーバ強制（402）・結果の記録・履歴（本人の完了済みのみ）の
// レスポンス契約を固定する。成績は本人のみ＝他人の行は返さない/触れない。

import { FREE_QUIZ_PER_DAY } from "@rigel/schema";
import { describe, expect, it } from "vitest";
import type { AppContainer } from "../../../composition-root";
import {
  FinishQuizSession,
  GetQuizRanking,
  GetQuizSession,
  ListQuizSessions,
  StartQuizSession,
} from "../../../application/quiz.usecase";
import { User } from "../../../domain/user/user";
import { JwtSessionService } from "../../../infrastructure/auth/jwt-session-service";
import { DrizzleQuizSessionRepository } from "../../../infrastructure/quiz/drizzle-quiz-session.repository";
import { DrizzleUserRepository } from "../../../infrastructure/user/drizzle-user.repository";
import { fakeEnv, issueTestToken, TEST_SESSION_SECRET } from "../../../test-support/billing";
import { makeTestDb } from "../../../test-support/sqlite";
import { createApp } from "../app";

const NOW = new Date("2026-07-24T03:00:00.000Z"); // JST 2026-07-24 12:00

/** 実ユースケース＋実 Drizzle リポジトリのアプリを組む（now は差し替え可能）。 */
async function makeQuizApp() {
  const db = makeTestDb();
  const users = new DrizzleUserRepository(db);
  const free = User.create({ id: "u-free", googleSub: "sub-free", now: NOW });
  const paid = User.create({ id: "u-paid", googleSub: "sub-paid", now: NOW });
  paid.changePlan("next", "STRIPE");
  await users.save(free);
  await users.save(paid);

  const sessions = new DrizzleQuizSessionRepository(db);
  let seq = 0;
  const clock = { now: NOW };
  const container = {
    session: new JwtSessionService({ secret: TEST_SESSION_SECRET }),
    startQuizSession: new StartQuizSession({
      users,
      sessions,
      now: () => clock.now,
      newId: () => `q${++seq}`,
      newSeed: () => 42,
    }),
    finishQuizSession: new FinishQuizSession({
      users,
      sessions,
      now: () => clock.now,
      engineVersion: 1,
      // リプレイのスタブ（再採点の中身はユースケース・@rigel/ui のテストが担保。
      // ここではレスポンス契約の検証に必要な最小の形だけ返す）。
      replay: (_kind, _seed, answers) =>
        answers.map((a) => ({
          question: {
            kind: "chinitsu",
            // prettier-ignore
            tiles: ["1p", "2p", "3p", "4p", "4p", "5p", "5p", "5p", "6p", "6p", "7p", "8p", "9p"],
            answer: ["4p", "5p", "6p"],
          },
          picked: [...a.picked],
          ok: a.picked[0] === "4p",
        })),
    }),
    getQuizSession: new GetQuizSession({ users, sessions }),
    getQuizRanking: new GetQuizRanking({ sessions, now: () => clock.now }),
    listQuizSessions: new ListQuizSessions({ sessions }),
  } as Partial<AppContainer> as AppContainer;
  const app = createApp({ container: () => container });

  const request = async (path: string, init?: RequestInit) => app.request(path, init, fakeEnv);
  const authInit = async (
    userId: string,
    init: Omit<RequestInit, "headers"> & { json?: unknown } = {},
  ): Promise<RequestInit> => ({
    method: init.method,
    headers: {
      authorization: `Bearer ${await issueTestToken(userId)}`,
      ...(init.json !== undefined ? { "content-type": "application/json" } : {}),
    },
    ...(init.json !== undefined ? { body: JSON.stringify(init.json) } : {}),
  });
  return { request, authInit, clock };
}

const RESULT = { kind: "chinitsu", total: 10, correct: 7, durationMs: 61_000 };

describe("POST /quiz/sessions（開始 = 消費）", () => {
  it("トークン無しは 401", async () => {
    const { request } = await makeQuizApp();
    const res = await request("/quiz/sessions", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ kind: "chinitsu" }),
    });
    expect(res.status).toBe(401);
  });

  it("free の1回目は 201 で id と remainingToday を返す", async () => {
    const { request, authInit } = await makeQuizApp();
    const res = await request(
      "/quiz/sessions",
      await authInit("u-free", { method: "POST", json: { kind: "chinitsu" } }),
    );
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({
      ok: true,
      id: "q1",
      seed: 42,
      remainingToday: FREE_QUIZ_PER_DAY - 1,
    });
  });

  it("free の上限+1回目は 402 quota_exceeded（枠系エラーの流儀）", async () => {
    const { request, authInit } = await makeQuizApp();
    for (let i = 0; i < FREE_QUIZ_PER_DAY; i++) {
      const res = await request(
        "/quiz/sessions",
        await authInit("u-free", { method: "POST", json: { kind: "chinitsu" } }),
      );
      expect(res.status).toBe(201);
    }
    const res = await request(
      "/quiz/sessions",
      await authInit("u-free", { method: "POST", json: { kind: "chinitsu" } }),
    );
    expect(res.status).toBe(402);
    expect(await res.json()).toEqual({ ok: false, reason: "quota_exceeded" });
  });

  it("JST 0時（UTC 15:00）を跨ぐと free の枠が回復する", async () => {
    const { request, authInit, clock } = await makeQuizApp();
    for (let i = 0; i < FREE_QUIZ_PER_DAY; i++) {
      await request(
        "/quiz/sessions",
        await authInit("u-free", { method: "POST", json: { kind: "chinitsu" } }),
      );
    }
    clock.now = new Date("2026-07-24T15:00:00.000Z"); // JST 7/25 0:00
    const res = await request(
      "/quiz/sessions",
      await authInit("u-free", { method: "POST", json: { kind: "chinitsu" } }),
    );
    expect(res.status).toBe(201);
    expect(await res.json()).toMatchObject({ remainingToday: FREE_QUIZ_PER_DAY - 1 });
  });

  it("有料（next）は上限を超えても 201 で remainingToday=null（無制限）", async () => {
    const { request, authInit } = await makeQuizApp();
    for (let i = 0; i < FREE_QUIZ_PER_DAY + 1; i++) {
      const res = await request(
        "/quiz/sessions",
        await authInit("u-paid", { method: "POST", json: { kind: "efficiency" } }),
      );
      expect(res.status).toBe(201);
      expect(await res.json()).toMatchObject({ remainingToday: null });
    }
  });

  it("kind=score（点数計算 [決定] 2026-07-26 追加）でも開始できる", async () => {
    const { request, authInit } = await makeQuizApp();
    const res = await request(
      "/quiz/sessions",
      await authInit("u-free", { method: "POST", json: { kind: "score" } }),
    );
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({
      ok: true,
      id: "q1",
      seed: 42,
      remainingToday: FREE_QUIZ_PER_DAY - 1,
    });
  });

  it("不正な kind は 400", async () => {
    const { request, authInit } = await makeQuizApp();
    const res = await request(
      "/quiz/sessions",
      await authInit("u-free", { method: "POST", json: { kind: "speed" } }),
    );
    expect(res.status).toBe(400);
  });
});

describe("PATCH /quiz/sessions/:id（完了 = 結果の記録）", () => {
  it("自分の行に結果を書け、履歴に現れる", async () => {
    const { request, authInit } = await makeQuizApp();
    await request(
      "/quiz/sessions",
      await authInit("u-free", { method: "POST", json: { kind: "chinitsu" } }),
    );
    const res = await request(
      "/quiz/sessions/q1",
      await authInit("u-free", { method: "PATCH", json: RESULT }),
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });

    const list = await request("/quiz/sessions", await authInit("u-free"));
    expect(list.status).toBe(200);
    const body = (await list.json()) as Record<string, unknown>[];
    expect(body).toHaveLength(1);
    // レスポンス契約: ホワイトリストの6項目のみ（userId 等の内部情報を漏らさない）。
    expect(Object.keys(body[0]!).sort()).toEqual([
      "correct",
      "createdAt",
      "durationMs",
      "id",
      "kind",
      "total",
    ]);
    expect(body[0]).toMatchObject({
      id: "q1",
      kind: "chinitsu",
      total: 10,
      correct: 7,
      durationMs: 61_000,
      createdAt: NOW.toISOString(),
    });
  });

  it("correct > total（スキーマ違反）は 400 で保存されない", async () => {
    const { request, authInit } = await makeQuizApp();
    await request(
      "/quiz/sessions",
      await authInit("u-free", { method: "POST", json: { kind: "chinitsu" } }),
    );
    const res = await request(
      "/quiz/sessions/q1",
      await authInit("u-free", { method: "PATCH", json: { ...RESULT, total: 3, correct: 4 } }),
    );
    expect(res.status).toBe(400);
    const list = await request("/quiz/sessions", await authInit("u-free"));
    expect(await list.json()).toEqual([]); // 未完了のまま = 履歴に出ない
  });

  it("他人の行は 404（存在を伏せる）・存在しない行も 404", async () => {
    const { request, authInit } = await makeQuizApp();
    await request(
      "/quiz/sessions",
      await authInit("u-free", { method: "POST", json: { kind: "chinitsu" } }),
    );
    const other = await request(
      "/quiz/sessions/q1",
      await authInit("u-paid", { method: "PATCH", json: RESULT }),
    );
    expect(other.status).toBe(404);
    const missing = await request(
      "/quiz/sessions/missing",
      await authInit("u-free", { method: "PATCH", json: RESULT }),
    );
    expect(missing.status).toBe(404);
  });

  it("トークン無しは 401", async () => {
    const { request } = await makeQuizApp();
    const res = await request("/quiz/sessions/q1", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(RESULT),
    });
    expect(res.status).toBe(401);
  });
});

describe("GET /quiz/sessions/:id（詳細は本人のみ。records は現在プランが有料のときだけ）", () => {
  /** 開始→60秒後に全回答つきで完了させる（userId のセッションは q1）。 */
  async function play(userId: string) {
    const made = await makeQuizApp();
    const { request, authInit, clock } = made;
    await request(
      "/quiz/sessions",
      await authInit(userId, { method: "POST", json: { kind: "chinitsu" } }),
    );
    clock.now = new Date(NOW.getTime() + 61_000);
    const finish = {
      kind: "chinitsu",
      total: 1,
      correct: 1,
      durationMs: 61_000,
      engineVersion: 1,
      answers: [{ picked: ["4p"] }],
    };
    await request("/quiz/sessions/q1", await authInit(userId, { method: "PATCH", json: finish }));
    return made;
  }

  it("有料は records（見直しレコード）つきで返る。内部情報（seed/userId 等）は出さない", async () => {
    const { request, authInit } = await play("u-paid");
    const res = await request("/quiz/sessions/q1", await authInit("u-paid"));
    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    expect(Object.keys(body).sort()).toEqual([
      "correct",
      "createdAt",
      "durationMs",
      "id",
      "kind",
      "records",
      "total",
    ]);
    expect(body).toMatchObject({ id: "q1", kind: "chinitsu", total: 1, correct: 1 });
    expect(body.records).toHaveLength(1);
    expect((body.records as Record<string, unknown>[])[0]).toMatchObject({
      picked: ["4p"],
      ok: true,
    });
  });

  it("無料は records が null（保存していない）", async () => {
    const { request, authInit } = await play("u-free");
    const res = await request("/quiz/sessions/q1", await authInit("u-free"));
    expect(res.status).toBe(200);
    expect(((await res.json()) as { records: unknown }).records).toBeNull();
  });

  it("他人の行・未完了の行は 404（存在を伏せる）・トークン無しは 401", async () => {
    const { request, authInit } = await play("u-paid");
    expect((await request("/quiz/sessions/q1", await authInit("u-free"))).status).toBe(404);
    // 未完了（開始のみ）の行。
    await request(
      "/quiz/sessions",
      await authInit("u-paid", { method: "POST", json: { kind: "score" } }),
    );
    expect((await request("/quiz/sessions/q2", await authInit("u-paid"))).status).toBe(404);
    expect((await request("/quiz/sessions/q1")).status).toBe(401);
  });
});

describe("GET /ranking（匿名可・verified セッションの集計のみ）", () => {
  /** u-paid で全回答つきの verified セッションを1本作る（picked 4p = replay スタブで正解）。 */
  async function playVerified() {
    const made = await makeQuizApp();
    const { request, authInit, clock } = made;
    await request(
      "/quiz/sessions",
      await authInit("u-paid", { method: "POST", json: { kind: "chinitsu" } }),
    );
    clock.now = new Date(NOW.getTime() + 61_000);
    await request(
      "/quiz/sessions/q1",
      await authInit("u-paid", {
        method: "PATCH",
        json: {
          kind: "chinitsu",
          total: 1,
          correct: 1,
          durationMs: 61_000,
          engineVersion: 1,
          answers: [{ picked: ["4p"] }],
        },
      }),
    );
    return made;
  }

  it("匿名で取得でき、handle/displayName と集計値だけを返す（me は null・短期キャッシュ可）", async () => {
    const { request } = await playVerified();
    const res = await request("/ranking?kind=chinitsu&period=all");
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("public, max-age=60");
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.kind).toBe("chinitsu");
    expect(body.period).toBe("all");
    expect(body.me).toBeNull();
    const entries = body.correct as Record<string, unknown>[];
    expect(entries).toHaveLength(1);
    // userId・email 等の内部情報は返さない（公開情報＝handle/displayName と集計値のみ）。
    expect(Object.keys(entries[0]!).sort()).toEqual([
      "accuracy",
      "correct",
      "displayName",
      "handle",
      "rank",
      "total",
    ]);
    expect(entries[0]).toMatchObject({ rank: 1, correct: 1, total: 1 });
  });

  it("申告のみ（answers なし=unverified）のセッションはランキングに載らない", async () => {
    const { request, authInit } = await makeQuizApp();
    await request(
      "/quiz/sessions",
      await authInit("u-free", { method: "POST", json: { kind: "chinitsu" } }),
    );
    await request("/quiz/sessions/q1", await authInit("u-free", { method: "PATCH", json: RESULT }));
    const res = await request("/ranking?kind=chinitsu&period=all");
    expect(((await res.json()) as { correct: unknown[] }).correct).toEqual([]);
  });

  it("サインイン時は自分の順位（me）が付き、キャッシュさせない", async () => {
    const { request, authInit } = await playVerified();
    const res = await request("/ranking?kind=chinitsu&period=all", await authInit("u-paid"));
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("private, no-store");
    const body = (await res.json()) as { me: { correctRank: number } | null };
    expect(body.me).toMatchObject({ correctRank: 1, correct: 1, total: 1 });
  });

  it("period 省略は weekly・不正な kind/period は 400", async () => {
    const { request } = await makeQuizApp();
    const res = await request("/ranking?kind=chinitsu");
    expect(((await res.json()) as { period: string }).period).toBe("weekly");
    expect((await request("/ranking?kind=speed")).status).toBe(400);
    expect((await request("/ranking?kind=chinitsu&period=daily")).status).toBe(400);
  });
});

describe("GET /quiz/sessions（履歴は本人の完了済みのみ）", () => {
  it("他人の成績は混ざらない", async () => {
    const { request, authInit } = await makeQuizApp();
    await request(
      "/quiz/sessions",
      await authInit("u-free", { method: "POST", json: { kind: "chinitsu" } }),
    );
    await request("/quiz/sessions/q1", await authInit("u-free", { method: "PATCH", json: RESULT }));
    await request(
      "/quiz/sessions",
      await authInit("u-paid", { method: "POST", json: { kind: "efficiency" } }),
    );
    await request(
      "/quiz/sessions/q2",
      await authInit("u-paid", { method: "PATCH", json: { ...RESULT, kind: "efficiency" } }),
    );

    const mine = (await (await request("/quiz/sessions", await authInit("u-free"))).json()) as {
      id: string;
    }[];
    expect(mine.map((s) => s.id)).toEqual(["q1"]);
  });

  it("since（ISO8601）以降だけ返す", async () => {
    const { request, authInit, clock } = await makeQuizApp();
    await request(
      "/quiz/sessions",
      await authInit("u-free", { method: "POST", json: { kind: "chinitsu" } }),
    );
    await request("/quiz/sessions/q1", await authInit("u-free", { method: "PATCH", json: RESULT }));
    clock.now = new Date("2026-07-26T03:00:00.000Z");
    await request(
      "/quiz/sessions",
      await authInit("u-free", { method: "POST", json: { kind: "chinitsu" } }),
    );
    await request("/quiz/sessions/q2", await authInit("u-free", { method: "PATCH", json: RESULT }));

    const res = await request(
      "/quiz/sessions?since=2026-07-25T00:00:00.000Z",
      await authInit("u-free"),
    );
    const body = (await res.json()) as { id: string }[];
    expect(body.map((s) => s.id)).toEqual(["q2"]);
  });

  it("不正な since は 400・トークン無しは 401", async () => {
    const { request, authInit } = await makeQuizApp();
    expect((await request("/quiz/sessions?since=bad", await authInit("u-free"))).status).toBe(400);
    expect((await request("/quiz/sessions")).status).toBe(401);
  });
});
