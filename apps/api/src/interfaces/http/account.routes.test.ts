// /me・/auth/apple の HTTP 統合テスト（ルート → ユースケース → in-memory リポジトリ）。
// クライアント（web/mobile）が購読管理の出し分けに使う planStore を含め、
// レスポンス契約を固定する（email・Apple の sub/refresh token は絶対に出さない）。

import { describe, expect, it } from "vitest";
import { AuthenticateWithApple } from "../../application/authenticate-with-apple.usecase";
import { AuthenticateWithReviewCode } from "../../application/authenticate-with-review-code.usecase";
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

describe("POST /auth/apple/callback", () => {
  // Android の Sign in with Apple（web フロー）の中継。Apple は redirect_uri に HTTPS しか
  // 許さず、scope 付きは response_mode=form_post 固定のため、Apple からの form POST を
  // ここで受けてアプリのカスタム scheme へ 302 で返す（トークン検証は /auth/apple の責務）。
  async function postForm(form: Record<string, string>) {
    const app = createApp({
      container: billingTestContainer({ users: new InMemoryUserRepository() }),
    });
    return app.request(
      "/auth/apple/callback",
      {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams(form).toString(),
      },
      fakeEnv,
    );
  }

  it("id_token/code/state をアプリの scheme へ 302 で中継する", async () => {
    const res = await postForm({ id_token: "t-1", code: "c-1", state: "s-1" });

    expect(res.status).toBe(302);
    const loc = new URL(res.headers.get("location")!);
    expect(loc.href.startsWith("jp.co.plaria.rigel://apple-callback?")).toBe(true);
    expect(loc.searchParams.get("id_token")).toBe("t-1");
    expect(loc.searchParams.get("code")).toBe("c-1");
    expect(loc.searchParams.get("state")).toBe("s-1");
  });

  it("Apple からの error（キャンセル等）も error として中継する", async () => {
    const res = await postForm({ error: "user_cancelled_authorize", state: "s-1" });

    expect(res.status).toBe(302);
    const loc = new URL(res.headers.get("location")!);
    expect(loc.searchParams.get("error")).toBe("user_cancelled_authorize");
    expect(loc.searchParams.get("state")).toBe("s-1");
    expect(loc.searchParams.has("id_token")).toBe(false);
  });

  it("id_token も error も無い不正な POST は error=invalid_response で返す", async () => {
    const res = await postForm({});

    expect(res.status).toBe(302);
    const loc = new URL(res.headers.get("location")!);
    expect(loc.searchParams.get("error")).toBe("invalid_response");
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

describe("POST /auth/review", () => {
  // ストア審査用の合言葉ログイン（docs/plans/review-login.md 案B）。
  // Secret 未設定なら 501 で口ごと閉じる（/auth/apple の 501 と同じ流儀）。
  function reviewApp(users: InMemoryUserRepository, secret: string) {
    const session = new JwtSessionService({ secret: "test-secret" });
    const container = {
      reviewAuthEnabled: Boolean(secret),
      session,
      authenticateWithReviewCode: new AuthenticateWithReviewCode({
        users,
        session,
        now: () => new Date("2026-08-01T00:00:00.000Z"),
        newId: () => "u-review",
        randomHandle: () => "randomreview",
        secret,
      }),
    } as Partial<AppContainer> as AppContainer;
    return createApp({ container: () => container });
  }

  function postReview(app: ReturnType<typeof createApp>, body: unknown) {
    return app.request(
      "/auth/review",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      },
      fakeEnv,
    );
  }

  it("Secret 未設定なら 501（審査期間外は口が存在しないのと同じ）", async () => {
    const res = await postReview(reviewApp(new InMemoryUserRepository(), ""), { code: "x" });
    expect(res.status).toBe(501);
  });

  it("code が無ければ 400", async () => {
    const res = await postReview(reviewApp(new InMemoryUserRepository(), "sesame"), {});
    expect(res.status).toBe(400);
  });

  it("誤った code は 401（詳細は返さない・ユーザーを作らない）", async () => {
    const users = new InMemoryUserRepository();
    const res = await postReview(reviewApp(users, "sesame"), { code: "wrong" });
    expect(res.status).toBe(401);
    expect(users.size).toBe(0);
  });

  it("正しい code は 201 で公開プロフィールのみ返す（/auth/google と同形）", async () => {
    const res = await postReview(reviewApp(new InMemoryUserRepository(), "sesame"), {
      code: "sesame",
    });

    expect(res.status).toBe(201);
    const body = (await res.json()) as { sessionToken: string; user: Record<string, unknown> };
    expect(typeof body.sessionToken).toBe("string");
    expect(Object.keys(body.user).sort()).toEqual([
      "displayName",
      "handle",
      "id",
      "plan",
      "planStore",
    ]);
  });
});
