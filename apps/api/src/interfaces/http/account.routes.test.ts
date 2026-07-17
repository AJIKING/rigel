// /me・/auth/apple の HTTP 統合テスト（ルート → ユースケース → in-memory リポジトリ）。
// クライアント（web/mobile）が購読管理の出し分けに使う planStore を含め、
// レスポンス契約を固定する（email・Apple の sub/refresh token は絶対に出さない）。

import { describe, expect, it } from "vitest";
import { AuthenticateWithApple } from "../../application/authenticate-with-apple.usecase";
import type { AppContainer } from "../../composition-root";
import { JwtSessionService } from "../../infrastructure/auth/jwt-session-service";
import {
  billingTestContainer,
  fakeEnv,
  issueTestToken,
  makeFreeUser,
} from "../../test-support/billing";
import { InMemoryUserRepository } from "../../test-support/in-memory";
import { createApp } from "./app";

async function getMe(users: InMemoryUserRepository, userId: string) {
  const app = createApp({ container: billingTestContainer({ users }) });
  const res = await app.request(
    "/me",
    { headers: { authorization: `Bearer ${await issueTestToken(userId)}` } },
    fakeEnv,
  );
  expect(res.status).toBe(200);
  return (await res.json()) as Record<string, unknown>;
}

describe("GET /me", () => {
  it("プラン・解析枠に加えて購入経路（planStore）を返す", async () => {
    const paid = makeFreeUser("u1");
    paid.changePlan("next", "APP_STORE");
    const body = await getMe(new InMemoryUserRepository([paid]), "u1");

    expect(body).toMatchObject({ id: "u1", plan: "next", planStore: "APP_STORE" });
    expect(body.monthlyCallQuota).toBe(100);
    expect(body.remainingCalls).toBe(100);
  });

  it("free は planStore が null。email は絶対に含めない", async () => {
    const body = await getMe(new InMemoryUserRepository([makeFreeUser("u1")]), "u1");

    expect(body.plan).toBe("free");
    expect(body.planStore).toBeNull();
    expect("email" in body).toBe(false);
  });
});

describe("POST /auth/apple", () => {
  it("成功レスポンスは公開プロフィールのみ（email・appleSub・appleRefreshToken を含めない）", async () => {
    const users = new InMemoryUserRepository();
    const container = {
      appleAuthEnabled: true,
      session: new JwtSessionService({ secret: "test-secret" }),
      authenticateWithApple: new AuthenticateWithApple({
        users,
        verifier: {
          verify: () =>
            Promise.resolve({
              sub: "apple-1",
              email: "x@privaterelay.appleid.com",
              aud: "jp.co.plaria.rigel",
            }),
        },
        appleAuth: null,
        session: new JwtSessionService({ secret: "test-secret" }),
        now: () => new Date("2026-07-17T00:00:00.000Z"),
        newId: () => "u-apple",
        randomHandle: () => "randomapple",
      }),
    } as Partial<AppContainer> as AppContainer;
    const app = createApp({ container: () => container });

    const res = await app.request(
      "/auth/apple",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ idToken: "t" }),
      },
      fakeEnv,
    );

    expect(res.status).toBe(201);
    const body = (await res.json()) as { sessionToken: string; user: Record<string, unknown> };
    expect(typeof body.sessionToken).toBe("string");
    // user はホワイトリスト（userProfileJson）のみ。運用専用情報は漏らさない。
    expect(Object.keys(body.user).sort()).toEqual([
      "displayName",
      "handle",
      "id",
      "plan",
      "planStore",
    ]);
  });
});
