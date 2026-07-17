import { describe, expect, it } from "vitest";
import type { AppleAuthGateway } from "../domain/auth/apple-auth-gateway";
import type { AppleIdentity } from "../domain/auth/apple-identity";
import type { AppleTokenVerifier } from "../domain/auth/apple-token-verifier";
import type { SessionService } from "../domain/auth/session";
import { InMemoryUserRepository } from "../test-support/in-memory";
import { AuthenticateWithApple } from "./authenticate-with-apple.usecase";

const NOW = new Date("2026-07-17T00:00:00.000Z");

const verifier = (identity: AppleIdentity): AppleTokenVerifier => ({
  verify: () => Promise.resolve(identity),
});

const fakeSession: SessionService = {
  issue: (userId) => Promise.resolve(`token:${userId}`),
  verify: (token) =>
    Promise.resolve(token.startsWith("token:") ? { userId: token.slice(6) } : null),
};

/** 交換された code と発行した refresh token を記録するフェイク。 */
class FakeAppleAuth implements AppleAuthGateway {
  exchanged: { code: string; clientId: string }[] = [];
  revoked: string[] = [];
  failExchange = false;

  exchangeCode(code: string, clientId: string): Promise<string | null> {
    this.exchanged.push({ code, clientId });
    if (this.failExchange) return Promise.reject(new Error("apple down"));
    return Promise.resolve(`refresh:${code}`);
  }

  revokeToken(refreshToken: string): Promise<void> {
    this.revoked.push(refreshToken);
    return Promise.resolve();
  }
}

function makeUsecase(
  users: InMemoryUserRepository,
  sub: string,
  opts: { identity?: Partial<AppleIdentity>; appleAuth?: AppleAuthGateway | null } = {},
  randomHandle = "randomapple",
) {
  let n = 0;
  return new AuthenticateWithApple({
    users,
    verifier: verifier({
      sub,
      email: "a@privaterelay.appleid.com",
      aud: "jp.rigel.app",
      ...opts.identity,
    }),
    appleAuth: opts.appleAuth ?? null,
    session: fakeSession,
    now: () => NOW,
    newId: () => `user-${++n}`,
    randomHandle: () => randomHandle,
  });
}

describe("AuthenticateWithApple", () => {
  it("初回ログインはユーザーを作成しトークンを発行する（apple_sub 紐付け・googleSub は無し）", async () => {
    const users = new InMemoryUserRepository();
    const result = await makeUsecase(users, "apple-sub-1").execute({ idToken: "id" });

    expect(result.created).toBe(true);
    expect(result.user.appleSub).toBe("apple-sub-1");
    expect(result.user.googleSub).toBeNull();
    expect(result.user.plan).toBe("free");
    expect(result.sessionToken).toBe(`token:${result.user.id}`);
    expect(users.size).toBe(1);
  });

  it("初回は Apple 情報を使わずランダムな handle/表示名を設定し、email は運用のため保存する", async () => {
    const users = new InMemoryUserRepository();
    const result = await makeUsecase(users, "a1").execute({ idToken: "id" });
    expect(result.user.handle).toBe("randomapple");
    expect(result.user.displayName).toBe("randomapple");
    expect(result.user.email).toBe("a@privaterelay.appleid.com");
  });

  it("既存ユーザーは作り直さず同じユーザーを返す", async () => {
    const users = new InMemoryUserRepository();
    const first = await makeUsecase(users, "apple-sub-1").execute({ idToken: "id" });
    const second = await makeUsecase(users, "apple-sub-1").execute({ idToken: "id" });

    expect(second.created).toBe(false);
    expect(second.user.id).toBe(first.user.id);
    expect(users.size).toBe(1);
  });

  it("authorizationCode があれば refresh token に交換して保存する（退会時の失効用）", async () => {
    const users = new InMemoryUserRepository();
    const appleAuth = new FakeAppleAuth();
    const result = await makeUsecase(users, "a1", { appleAuth }).execute({
      idToken: "id",
      authorizationCode: "code-1",
    });

    // 交換の client_id は idToken の aud（web=Services ID / アプリ=Bundle ID を自動で選ぶ）。
    expect(appleAuth.exchanged).toEqual([{ code: "code-1", clientId: "jp.rigel.app" }]);
    expect(result.user.appleRefreshToken).toBe("refresh:code-1");
    const saved = await users.findByAppleSub("a1");
    expect(saved?.appleRefreshToken).toBe("refresh:code-1");
  });

  it("refresh token 交換が失敗してもログイン自体は成功する（交換はベストエフォート）", async () => {
    const users = new InMemoryUserRepository();
    const appleAuth = new FakeAppleAuth();
    appleAuth.failExchange = true;
    const result = await makeUsecase(users, "a1", { appleAuth }).execute({
      idToken: "id",
      authorizationCode: "code-1",
    });
    expect(result.created).toBe(true);
    expect(result.user.appleRefreshToken).toBeNull();
  });

  it("ゲートウェイ未設定（鍵なし）なら交換はスキップしてログインする", async () => {
    const users = new InMemoryUserRepository();
    const result = await makeUsecase(users, "a1", { appleAuth: null }).execute({
      idToken: "id",
      authorizationCode: "code-1",
    });
    expect(result.created).toBe(true);
    expect(result.user.appleRefreshToken).toBeNull();
  });
});
