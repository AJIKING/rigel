// /me の HTTP 統合テスト（ルート → GetUser → in-memory リポジトリ）。
// クライアント（web/mobile）が購読管理の出し分けに使う planStore を含め、
// /me のレスポンス契約を固定する（email は絶対に出さない）。

import { describe, expect, it } from "vitest";
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
