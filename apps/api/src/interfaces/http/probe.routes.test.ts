// 一時検証ルートのテスト（docs/plans/async-analysis.md Task 1。検証後にルートごと削除）。
// ctx.waitUntil が応答後に数分の処理を完走できるかを本番実測するための足場。

import { describe, expect, it, vi } from "vitest";
import type { Env } from "../../env";
import { billingTestContainer, fakeEnv } from "../../test-support/billing";
import { InMemoryUserRepository } from "../../test-support/in-memory";
import { createApp } from "./app";

const probeEnv: Env = { ...fakeEnv, REVIEW_LOGIN_SECRET: "probe-secret" };

function probeApp() {
  return createApp({ container: billingTestContainer({ users: new InMemoryUserRepository() }) });
}

function post(secret: string | null, env: Env = probeEnv, executionCtx?: ExecutionContext) {
  return probeApp().request(
    "/debug/wait-until-probe",
    { method: "POST", headers: secret ? { "x-probe-secret": secret } : {} },
    env,
    executionCtx,
  );
}

describe("POST /debug/wait-until-probe（一時検証ルート）", () => {
  it("REVIEW_LOGIN_SECRET 未設定なら 501", async () => {
    const res = await post("x", fakeEnv);
    expect(res.status).toBe(501);
  });

  it("secret 不一致は 401", async () => {
    const res = await post("wrong");
    expect(res.status).toBe(401);
  });

  it("一致すれば 202 を即返し、waitUntil に長時間処理を渡す", async () => {
    const waitUntil = vi.fn();
    const res = await post("probe-secret", probeEnv, {
      waitUntil,
      passThroughOnException: () => {},
      props: {},
    } as unknown as ExecutionContext);

    expect(res.status).toBe(202);
    expect(waitUntil).toHaveBeenCalledTimes(1);
  });
});
