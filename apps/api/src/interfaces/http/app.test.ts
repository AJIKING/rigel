import { describe, expect, it } from "vitest";
import type { Env } from "../../env";
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

  it("POST /analyze は M5 まで 501", async () => {
    const res = await app.request("/analyze", { method: "POST" }, fakeEnv);
    expect(res.status).toBe(501);
  });

  it("POST /auth/google は idToken が無ければ 400", async () => {
    const res = await app.request("/auth/google", jsonInit({}), fakeEnv);
    expect(res.status).toBe(400);
  });

  it("GET /me はトークン無しで 401", async () => {
    const res = await app.request("/me", {}, fakeEnv);
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
