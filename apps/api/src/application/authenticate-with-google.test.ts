import { describe, expect, it } from "vitest";
import type { GoogleIdentity } from "../domain/auth/google-identity";
import type { GoogleTokenVerifier } from "../domain/auth/google-token-verifier";
import type { SessionService } from "../domain/auth/session";
import { InMemoryUserRepository } from "../test-support/in-memory";
import { AuthenticateWithGoogle } from "./authenticate-with-google.usecase";

const NOW = new Date("2026-06-28T00:00:00.000Z");

const verifier = (identity: GoogleIdentity): GoogleTokenVerifier => ({
  verify: () => Promise.resolve(identity),
});

const fakeSession: SessionService = {
  issue: (userId) => Promise.resolve(`token:${userId}`),
  verify: (token) =>
    Promise.resolve(token.startsWith("token:") ? { userId: token.slice(6) } : null),
};

function makeUsecase(
  users: InMemoryUserRepository,
  sub: string,
  identity?: Partial<GoogleIdentity>,
  randomHandle = "randomuser",
) {
  let n = 0;
  return new AuthenticateWithGoogle({
    users,
    verifier: verifier({ sub, email: "a@example.com", ...identity }),
    session: fakeSession,
    now: () => NOW,
    newId: () => `user-${++n}`,
    randomHandle: () => randomHandle,
  });
}

describe("AuthenticateWithGoogle", () => {
  it("初回ログインはユーザーを作成しトークンを発行する", async () => {
    const users = new InMemoryUserRepository();
    const result = await makeUsecase(users, "google-sub-1").execute({ idToken: "id" });

    expect(result.created).toBe(true);
    expect(result.user.googleSub).toBe("google-sub-1");
    expect(result.user.plan).toBe("free");
    expect(result.sessionToken).toBe(`token:${result.user.id}`);
    expect(users.size).toBe(1);
  });

  it("初回は Google 情報を使わずランダムな handle/表示名を設定する", async () => {
    const users = new InMemoryUserRepository();
    const result = await makeUsecase(users, "g1", {
      email: "rin-riichi@example.com",
    }).execute({ idToken: "id" });

    // Google のメールは handle/表示名に使わない（表示名 name はそもそも取得しない）。
    // ランダム handle を割り当て、表示名も同じにする。
    expect(result.user.handle).toBe("randomuser");
    expect(result.user.displayName).toBe("randomuser");
    expect(result.user.displayName).not.toContain("rin-riichi");
  });

  it("email は運用のため保存する（handle/表示名には使わない）", async () => {
    const users = new InMemoryUserRepository();
    const result = await makeUsecase(users, "g1", { email: "abuse@example.com" }).execute({
      idToken: "id",
    });
    expect(result.user.email).toBe("abuse@example.com");
    expect(result.user.handle).not.toContain("abuse");
  });

  it("handle が既に使われていたら連番を足して一意にする", async () => {
    const users = new InMemoryUserRepository();
    await makeUsecase(users, "g1", undefined, "taro").execute({ idToken: "id" });
    const second = await makeUsecase(users, "g2", undefined, "taro").execute({ idToken: "id" });

    expect(second.user.handle).toBe("taro2");
  });

  it("既存ユーザーは作り直さず同じユーザーを返す", async () => {
    const users = new InMemoryUserRepository();
    const first = await makeUsecase(users, "google-sub-1").execute({ idToken: "id" });
    const second = await makeUsecase(users, "google-sub-1").execute({ idToken: "id" });

    expect(second.created).toBe(false);
    expect(second.user.id).toBe(first.user.id);
    expect(users.size).toBe(1);
  });
});
