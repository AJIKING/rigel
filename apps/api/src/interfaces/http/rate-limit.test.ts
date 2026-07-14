// レート制限のテスト。実バインディング（Cloudflare Rate Limiting）は差し替え可能な
// ポート（RateLimiter）として扱い、テストではフェイクを env に注入する。

import { describe, expect, it } from "vitest";
import type { Env } from "../../env";
import { JwtSessionService } from "../../infrastructure/auth/jwt-session-service";
import { fakeEnv } from "../../test-support/billing";
import { createApp } from "./app";
import type { RateLimiter } from "./rate-limit";

/** 常に拒否する（=枠を使い切った）リミッタ。 */
const denyAll: RateLimiter = { limit: async () => ({ success: false }) };
/** 呼ばれたキーを記録する許可リミッタ。 */
function allowAll() {
  const keys: string[] = [];
  const limiter: RateLimiter = {
    limit: async ({ key }) => {
      keys.push(key);
      return { success: true };
    },
  };
  return { limiter, keys };
}

const app = createApp();
const token = () => new JwtSessionService({ secret: "test-secret" }).issue("u1");

describe("レート制限", () => {
  it("公開エンドポイントは IP 単位で制限し、超過は 429 + Retry-After", async () => {
    const env = { ...fakeEnv, RL_READ: denyAll } as unknown as Env;
    const res = await app.request(
      "/games/public",
      { headers: { "cf-connecting-ip": "203.0.113.9" } },
      env,
    );
    expect(res.status).toBe(429);
    expect(res.headers.get("retry-after")).toBeTruthy();
  });

  it("公開読み取りのキーは IP（未ログインでも人ごとに数える）", async () => {
    const { limiter, keys } = allowAll();
    const env = { ...fakeEnv, RL_READ: limiter } as unknown as Env;
    await app.request("/problems", { headers: { "cf-connecting-ip": "203.0.113.9" } }, env);
    expect(keys).toEqual(["ip:203.0.113.9"]);
  });

  it("/problems/analyze は /analyze と同じ厳しめバケット（RL_ANALYZE・userId 単位）", async () => {
    const { limiter, keys } = allowAll();
    const env = { ...fakeEnv, RL_ANALYZE: limiter } as unknown as Env;
    await app.request(
      "/problems/analyze",
      { method: "POST", headers: { authorization: `Bearer ${await token()}` } },
      env,
    );
    expect(keys).toEqual(["user:u1"]);
  });

  it("書き込みは userId 単位で制限する（超過は 429）", async () => {
    const { limiter, keys } = allowAll();
    const env = { ...fakeEnv, RL_WRITE: limiter } as unknown as Env;
    await app.request(
      "/games/g1/rules",
      {
        method: "PATCH",
        headers: { authorization: `Bearer ${await token()}`, "content-type": "application/json" },
        body: JSON.stringify({ rules: {} }),
      },
      env,
    );
    expect(keys).toEqual(["user:u1"]);

    const denied = { ...fakeEnv, RL_WRITE: denyAll } as unknown as Env;
    const res = await app.request(
      "/games/g1/rules",
      {
        method: "PATCH",
        headers: { authorization: `Bearer ${await token()}`, "content-type": "application/json" },
        body: JSON.stringify({ rules: {} }),
      },
      denied,
    );
    expect(res.status).toBe(429);
  });

  it("/analyze は専用の厳しい枠で制限する（Gemini コストと同時実行の抑制）", async () => {
    const env = { ...fakeEnv, RL_ANALYZE: denyAll } as unknown as Env;
    const res = await app.request(
      "/analyze",
      { method: "POST", headers: { authorization: `Bearer ${await token()}` } },
      env,
    );
    expect(res.status).toBe(429);
  });

  it("バインディング未設定（ローカル開発・テスト）では制限しない", async () => {
    const res = await app.request("/games/public", {}, fakeEnv);
    expect(res.status).not.toBe(429);
  });
});
