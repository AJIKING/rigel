import { describe, expect, it } from "vitest";
import type { Env } from "../../env";
import { JwtSessionService } from "../../infrastructure/auth/jwt-session-service";
import { fakeEnv } from "../../test-support/billing";
import { minimalKifuInput } from "../../test-support/kifu";
import { createApp } from "./app";
import { BODY_LIMIT_BYTES, MAX_IMAGE_BYTES } from "./limits";

const jsonInit = (body: unknown): RequestInit => ({
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify(body),
});

const jsonInitAuth = (token: string, body: unknown): RequestInit => ({
  method: "POST",
  headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
  body: JSON.stringify(body),
});

describe("HTTP app (Hono)", () => {
  const app = createApp();

  it("GET /health は ok を返す", async () => {
    const res = await app.request("/health", {}, fakeEnv);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });

  it("CORS: 許可オリジンのプリフライトに ACAO を返す", async () => {
    const env = { ...fakeEnv, ALLOWED_ORIGINS: "https://raisha.jp" } satisfies Env;
    const res = await app.request(
      "/auth/google",
      {
        method: "OPTIONS",
        headers: {
          origin: "https://raisha.jp",
          "access-control-request-method": "POST",
        },
      },
      env,
    );
    expect(res.headers.get("access-control-allow-origin")).toBe("https://raisha.jp");
  });

  it("CORS: 許可外オリジンには ACAO を返さない", async () => {
    const env = { ...fakeEnv, ALLOWED_ORIGINS: "https://raisha.jp" } satisfies Env;
    const res = await app.request(
      "/auth/google",
      {
        method: "OPTIONS",
        headers: { origin: "https://evil.example", "access-control-request-method": "POST" },
      },
      env,
    );
    expect(res.headers.get("access-control-allow-origin")).toBeNull();
  });

  it("POST /kifu/validate は正しい牌譜を 200 で受理する", async () => {
    const res = await app.request("/kifu/validate", jsonInit(minimalKifuInput), fakeEnv);
    expect(res.status).toBe(200);
  });

  it("POST /kifu/validate は不正な牌譜を 400 で弾く", async () => {
    const res = await app.request("/kifu/validate", jsonInit({ schemaVersion: "9.9.9" }), fakeEnv);
    expect(res.status).toBe(400);
  });

  it("POST /analyze はトークン無しで 401", async () => {
    const res = await app.request("/analyze", { method: "POST" }, fakeEnv);
    expect(res.status).toBe(401);
  });

  it("POST /analyze は認証済みでも river/座席が無ければ 400", async () => {
    const token = await new JwtSessionService({ secret: "test-secret" }).issue("u1");
    const res = await app.request(
      "/analyze",
      { method: "POST", headers: { authorization: `Bearer ${token}` } },
      fakeEnv,
    );
    expect(res.status).toBe(400);
  });

  it("POST /problems/analyze はトークン無しで 401", async () => {
    const res = await app.request("/problems/analyze", { method: "POST" }, fakeEnv);
    expect(res.status).toBe(401);
  });

  it("POST /problems/analyze は認証済みでも hand（自分の手牌写真）が無ければ 400", async () => {
    const token = await new JwtSessionService({ secret: "test-secret" }).issue("u1");
    const res = await app.request(
      "/problems/analyze",
      { method: "POST", headers: { authorization: `Bearer ${token}` } },
      fakeEnv,
    );
    expect(res.status).toBe(400);
  });

  // 「量」の防御（乱用耐性）。形が正しくても大きすぎるものは入口で弾く。
  describe("サイズ・種別の上限", () => {
    const auth = async () => new JwtSessionService({ secret: "test-secret" }).issue("u1");

    it("巨大な JSON ボディは 413（D1 肥大・CPU 消費を入口で止める）", async () => {
      const huge = "x".repeat(BODY_LIMIT_BYTES + 1);
      const res = await app.request("/kifu/validate", jsonInit({ note: huge }), fakeEnv);
      expect(res.status).toBe(413);
    });

    it("/analyze は画像以外の MIME を 400（任意バイト列を画像として Gemini に送らない）", async () => {
      const form = new FormData();
      form.set("river", new File(["not-an-image"], "x.txt", { type: "text/plain" }));
      form.set("cameraBottomSeat", "east");
      const res = await app.request(
        "/analyze",
        { method: "POST", headers: { authorization: `Bearer ${await auth()}` }, body: form },
        fakeEnv,
      );
      expect(res.status).toBe(400);
    });

    it("/analyze は上限を超える画像を 400（バイトを読む前に弾く）", async () => {
      const form = new FormData();
      const big = new Uint8Array(MAX_IMAGE_BYTES + 1);
      form.set("river", new File([big], "big.jpg", { type: "image/jpeg" }));
      form.set("cameraBottomSeat", "east");
      const res = await app.request(
        "/analyze",
        { method: "POST", headers: { authorization: `Bearer ${await auth()}` }, body: form },
        fakeEnv,
      );
      expect(res.status).toBe(400);
    });
  });

  it("PATCH /games/:id/visibility はトークン無しで 401（公開範囲は半荘単位）", async () => {
    const res = await app.request(
      "/games/g1/visibility",
      {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ visibility: "public" }),
      },
      fakeEnv,
    );
    expect(res.status).toBe(401);
  });

  it("PATCH /games/:id/visibility は不正な値を 400", async () => {
    const token = await new JwtSessionService({ secret: "test-secret" }).issue("u1");
    const res = await app.request(
      "/games/g1/visibility",
      {
        method: "PATCH",
        headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
        body: JSON.stringify({ visibility: "secret" }),
      },
      fakeEnv,
    );
    expect(res.status).toBe(400);
  });

  it("PATCH /games/:id/players は players キー欠落を 400（サイレント全消去を防ぐ）", async () => {
    const token = await new JwtSessionService({ secret: "test-secret" }).issue("u1");
    const res = await app.request(
      "/games/g1/players",
      {
        method: "PATCH",
        headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
        body: JSON.stringify({ player: {} }), // typo（players キーが無い）
      },
      fakeEnv,
    );
    expect(res.status).toBe(400);
  });

  it("PUT /kifu/:id はトークン無しで 401", async () => {
    const res = await app.request(
      "/kifu/l1",
      {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(minimalKifuInput),
      },
      fakeEnv,
    );
    expect(res.status).toBe(401);
  });

  it("PUT /kifu/:id は認証済みでも不正な牌譜は 400", async () => {
    const token = await new JwtSessionService({ secret: "test-secret" }).issue("u1");
    const res = await app.request(
      "/kifu/l1",
      {
        method: "PUT",
        headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
        body: JSON.stringify({ schemaVersion: "9.9.9" }),
      },
      fakeEnv,
    );
    expect(res.status).toBe(400);
  });

  it("POST /billing/checkout はトークン無しで 401", async () => {
    const res = await app.request("/billing/checkout", { method: "POST" }, fakeEnv);
    expect(res.status).toBe(401);
  });

  it("POST /billing/checkout は Stripe 未設定なら 501", async () => {
    const token = await new JwtSessionService({ secret: "test-secret" }).issue("u1");
    const res = await app.request(
      "/billing/checkout",
      jsonInitAuth(token, { successUrl: "https://app/ok", cancelUrl: "https://app/ng" }),
      fakeEnv,
    );
    expect(res.status).toBe(501);
  });

  it("POST /billing/webhook は Stripe 未設定なら 501", async () => {
    const res = await app.request("/billing/webhook", { method: "POST" }, fakeEnv);
    expect(res.status).toBe(501);
  });

  it("POST /billing/revenuecat/webhook は RevenueCat 未設定なら 501", async () => {
    const res = await app.request("/billing/revenuecat/webhook", { method: "POST" }, fakeEnv);
    expect(res.status).toBe(501);
  });

  it("DELETE /kifu/:id はトークン無しで 401", async () => {
    const res = await app.request("/kifu/l1", { method: "DELETE" }, fakeEnv);
    expect(res.status).toBe(401);
  });

  it("POST /games/:id/kifu はトークン無しで 401", async () => {
    const res = await app.request("/games/g1/kifu", { method: "POST" }, fakeEnv);
    expect(res.status).toBe(401);
  });

  it("POST /auth/apple は APPLE_CLIENT_ID 未設定なら 501", async () => {
    const res = await app.request("/auth/apple", jsonInit({ idToken: "x" }), fakeEnv);
    expect(res.status).toBe(501);
  });

  it("POST /auth/apple は idToken が無ければ 400", async () => {
    const env = { ...fakeEnv, APPLE_CLIENT_ID: "jp.rigel.app" } satisfies Env;
    const res = await app.request("/auth/apple", jsonInit({}), env);
    expect(res.status).toBe(400);
  });

  it("POST /auth/google は idToken が無ければ 400", async () => {
    const res = await app.request("/auth/google", jsonInit({}), fakeEnv);
    expect(res.status).toBe(400);
  });

  it("GET /me はトークン無しで 401", async () => {
    const res = await app.request("/me", {}, fakeEnv);
    expect(res.status).toBe(401);
  });

  it("GET /games はトークン無しで 401", async () => {
    const res = await app.request("/games", {}, fakeEnv);
    expect(res.status).toBe(401);
  });

  it("GET /me/games はトークン無しで 401", async () => {
    const res = await app.request("/me/games", {}, fakeEnv);
    expect(res.status).toBe(401);
  });

  it("PUT /me/profile はトークン無しで 401", async () => {
    const res = await app.request("/me/profile", { method: "PUT" }, fakeEnv);
    expect(res.status).toBe(401);
  });

  it("DELETE /me はトークン無しで 401", async () => {
    const res = await app.request("/me", { method: "DELETE" }, fakeEnv);
    expect(res.status).toBe(401);
  });

  it("GET /games/:id はトークン無しで 401", async () => {
    const res = await app.request("/games/g1", {}, fakeEnv);
    expect(res.status).toBe(401);
  });

  it("何切る: 認証必須ルートはトークン無しで 401（mine/作成/回答/分布）", async () => {
    expect((await app.request("/problems/mine", {}, fakeEnv)).status).toBe(401);
    expect((await app.request("/problems", { method: "POST" }, fakeEnv)).status).toBe(401);
    expect((await app.request("/problems/p1", { method: "PUT" }, fakeEnv)).status).toBe(401);
    expect((await app.request("/problems/p1", { method: "DELETE" }, fakeEnv)).status).toBe(401);
    expect((await app.request("/problems/p1/answers", { method: "POST" }, fakeEnv)).status).toBe(
      401,
    );
    expect((await app.request("/problems/p1/stats", {}, fakeEnv)).status).toBe(401);
  });

  it("GET /me は偽のトークンで 401", async () => {
    const res = await app.request(
      "/me",
      { headers: { authorization: "Bearer not-a-real-token" } },
      fakeEnv,
    );
    expect(res.status).toBe(401);
  });
});
