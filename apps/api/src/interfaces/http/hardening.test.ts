// リリース前セキュリティ診断（docs/plans/security-hardening.md）の P6 ハードニング。
//   - 削除済みユーザーのトークンで孤児データを作れない（外部キーによる DB レベルの保証）
//   - 決済のリダイレクト先を許可オリジンに限定する（オープンリダイレクト隣接）

import { KifuSchema } from "@rigel/schema";
import { describe, expect, it } from "vitest";
import type { Env } from "../../env";
import { User } from "../../domain/user/user";
import { DrizzleGameRepository } from "../../infrastructure/game/drizzle-game.repository";
import { DrizzleGameLogRepository } from "../../infrastructure/kifu/drizzle-game-log.repository";
import { DrizzleAccountStore } from "../../infrastructure/user/drizzle-account-store";
import { DrizzleUserRepository } from "../../infrastructure/user/drizzle-user.repository";
import {
  billingTestContainer,
  fakeEnv,
  issueTestToken,
  makeFreeUser,
} from "../../test-support/billing";
import { InMemoryUserRepository } from "../../test-support/in-memory";
import { makeTestDb } from "../../test-support/sqlite";
import { createApp } from "./app";

const jsonAuth = (token: string, body: unknown): RequestInit => ({
  method: "POST",
  headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
  body: JSON.stringify(body),
});

describe("削除済みユーザーのトークン（孤児データの防止）", () => {
  // ステートレス JWT は失効リストを持たないため、アカウント削除後もトークンは exp
  //（最大30日）まで署名検証を通る。だが D1（SQLite）は外部キーを強制するので、
  // 存在しない userId で行を作ることはできない＝孤児データは生まれない。
  // 全書き込みに存在確認クエリを足すより、この DB レベルの保証を回帰テストで固定する。
  it("存在しないユーザーの局は外部キー制約で保存できない", async () => {
    const db = makeTestDb();
    const logs = new DrizzleGameLogRepository(db);

    await expect(
      logs.save({
        id: "l1",
        userId: "deleted-user",
        gameId: null,
        seq: 1,
        kifu: KifuSchema.parse({
          schemaVersion: "1.0.0",
          capturedAt: "2026-07-12T00:00:00.000Z",
          seats: { east: {}, south: {}, west: {}, north: {} },
        }),
        visibility: "private",
        status: "draft",
        createdAt: new Date("2026-07-12T00:00:00.000Z"),
      }),
    ).rejects.toThrow(/FOREIGN KEY/i);
  });
});

describe("アカウント削除（1トランザクション）", () => {
  it("配下の局・半荘とユーザーを消し、他人のデータは残す", async () => {
    const db = makeTestDb();
    const users = new DrizzleUserRepository(db);
    const games = new DrizzleGameRepository(db);
    const logs = new DrizzleGameLogRepository(db);
    const NOW = new Date("2026-07-12T00:00:00.000Z");
    const kifu = KifuSchema.parse({
      schemaVersion: "1.0.0",
      capturedAt: NOW.toISOString(),
      seats: { east: {}, south: {}, west: {}, north: {} },
    });

    for (const id of ["u1", "u2"]) {
      await users.save(User.create({ id, googleSub: `sub-${id}`, now: NOW }));
      await games.save({ id: `g-${id}`, userId: id, title: "", createdAt: NOW });
      await logs.save({
        id: `l-${id}`,
        userId: id,
        gameId: `g-${id}`,
        seq: 1,
        kifu,
        visibility: "private",
        status: "draft",
        createdAt: NOW,
      });
    }

    await new DrizzleAccountStore(db).deleteAll("u1");

    expect(await users.findById("u1")).toBeNull();
    expect(await logs.findById("l-u1")).toBeNull();
    expect(await games.findById("g-u1")).toBeNull();
    // 他人のデータは無傷。
    expect(await users.findById("u2")).not.toBeNull();
    expect(await logs.findById("l-u2")).not.toBeNull();
  });
});

describe("決済のリダイレクト先（オープンリダイレクト対策）", () => {
  const env = { ...fakeEnv, ALLOWED_ORIGINS: "https://app" } as Env;

  it("許可オリジン外の successUrl / cancelUrl は 400", async () => {
    const users = new InMemoryUserRepository([makeFreeUser("u1")]);
    const app = createApp({ container: billingTestContainer({ users }) });

    const res = await app.request(
      "/billing/checkout",
      jsonAuth(await issueTestToken("u1"), {
        plan: "pro",
        successUrl: "https://evil.example/ok",
        cancelUrl: "https://app/ng",
      }),
      env,
    );
    expect(res.status).toBe(400);
  });

  it("許可オリジン外の returnUrl（ポータル）も 400", async () => {
    const users = new InMemoryUserRepository([makeFreeUser("u1")]);
    const app = createApp({ container: billingTestContainer({ users }) });

    const res = await app.request(
      "/billing/portal",
      jsonAuth(await issueTestToken("u1"), { returnUrl: "https://evil.example/back" }),
      env,
    );
    expect(res.status).toBe(400);
  });

  it("アプリのカスタムスキーム（mobile の戻り先）は許可する", async () => {
    const users = new InMemoryUserRepository([makeFreeUser("u1")]);
    const app = createApp({ container: billingTestContainer({ users }) });

    const res = await app.request(
      "/billing/checkout",
      jsonAuth(await issueTestToken("u1"), {
        plan: "pro",
        successUrl: "jp.co.plaria.rigel://billing/ok",
        cancelUrl: "jp.co.plaria.rigel://billing/ng",
      }),
      env,
    );
    expect(res.status).toBe(200);
  });
});
