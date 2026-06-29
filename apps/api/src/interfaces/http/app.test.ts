import { describe, expect, it } from "vitest";
import type { Env } from "../../env";
import { JwtSessionService } from "../../infrastructure/auth/jwt-session-service";
import { minimalKifuInput } from "../../test-support/kifu";
import { createApp } from "./app";

// /health・/kifu/validate・/analyze は DB を使わないので、DB はダミーで足りる。
const fakeEnv = {
  DB: {} as unknown as D1Database,
  GEMINI_API_KEY: "",
  CLOUDFLARE_AI_GATEWAY_URL: "",
  GOOGLE_CLIENT_ID: "test-client-id",
  SESSION_SECRET: "test-secret",
} satisfies Env;

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

  it("PATCH /kifu/:id/visibility はトークン無しで 401", async () => {
    const res = await app.request(
      "/kifu/l1/visibility",
      {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ visibility: "public" }),
      },
      fakeEnv,
    );
    expect(res.status).toBe(401);
  });

  it("PATCH /kifu/:id/visibility は不正な値を 400", async () => {
    const token = await new JwtSessionService({ secret: "test-secret" }).issue("u1");
    const res = await app.request(
      "/kifu/l1/visibility",
      {
        method: "PATCH",
        headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
        body: JSON.stringify({ visibility: "secret" }),
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

  it("DELETE /kifu/:id はトークン無しで 401", async () => {
    const res = await app.request("/kifu/l1", { method: "DELETE" }, fakeEnv);
    expect(res.status).toBe(401);
  });

  it("POST /games/:id/kifu はトークン無しで 401", async () => {
    const res = await app.request("/games/g1/kifu", { method: "POST" }, fakeEnv);
    expect(res.status).toBe(401);
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

  it("GET /games/:id はトークン無しで 401", async () => {
    const res = await app.request("/games/g1", {}, fakeEnv);
    expect(res.status).toBe(401);
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
