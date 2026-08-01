// ストア審査用の合言葉ログイン（docs/plans/review-login.md 案B）。
// 正しい合言葉なら固定の合成 sub に紐づく審査ユーザーへ冪等にログインし、
// 誤り・未設定は例外（ルートが 401/501 に変換）。任意ユーザーに入る口ではない。

import { describe, expect, it } from "vitest";
import type { SessionService } from "../domain/auth/session";
import { InMemoryUserRepository } from "../test-support/in-memory";
import {
  AuthenticateWithReviewCode,
  REVIEW_LOGIN_SUB,
} from "./authenticate-with-review-code.usecase";

const NOW = new Date("2026-08-01T00:00:00.000Z");

const fakeSession: SessionService = {
  issue: (userId) => Promise.resolve(`token:${userId}`),
  verify: (token) =>
    Promise.resolve(token.startsWith("token:") ? { userId: token.slice(6) } : null),
};

function makeUsecase(users: InMemoryUserRepository, secret: string) {
  let n = 0;
  return new AuthenticateWithReviewCode({
    users,
    session: fakeSession,
    now: () => NOW,
    newId: () => `user-${++n}`,
    randomHandle: () => "randomreview",
    secret,
  });
}

describe("AuthenticateWithReviewCode", () => {
  it("正しい合言葉で審査ユーザーを作成しトークンを発行する（プロフィールはランダム・email なし）", async () => {
    const users = new InMemoryUserRepository();
    const result = await makeUsecase(users, "correct-secret").execute({ code: "correct-secret" });

    expect(result.created).toBe(true);
    expect(result.user.googleSub).toBe(REVIEW_LOGIN_SUB);
    expect(result.user.plan).toBe("free");
    expect(result.user.email).toBeNull();
    expect(result.user.handle).toBe("randomreview");
    expect(result.sessionToken).toBe(`token:${result.user.id}`);
    expect(users.size).toBe(1);
  });

  it("2回目以降は同じ審査ユーザーに冪等にログインする", async () => {
    const users = new InMemoryUserRepository();
    const usecase = makeUsecase(users, "correct-secret");
    const first = await usecase.execute({ code: "correct-secret" });
    const second = await usecase.execute({ code: "correct-secret" });

    expect(second.created).toBe(false);
    expect(second.user.id).toBe(first.user.id);
    expect(users.size).toBe(1);
  });

  it("誤った合言葉は例外（ユーザーを作らない）", async () => {
    const users = new InMemoryUserRepository();
    await expect(makeUsecase(users, "correct-secret").execute({ code: "wrong" })).rejects.toThrow();
    expect(users.size).toBe(0);
  });

  it("secret 未設定（空文字）は空の合言葉でも例外（口が開かない）", async () => {
    const users = new InMemoryUserRepository();
    await expect(makeUsecase(users, "").execute({ code: "" })).rejects.toThrow();
    expect(users.size).toBe(0);
  });
});
