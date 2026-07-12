// AnalysisStore の契約テスト（実装非依存）。
//
// 同じスイートを「本番の Drizzle/D1 実装（実 SQLite）」と「テストダブル（InMemory）」の
// 両方に流す。ダブルが本物から乖離した瞬間に落ちるようにするのが目的
//（過去に DrizzleAnalysisStore だけ status カラムを書かず、ダブルは書いていたため
//  ユニットテストが緑のまま本番で下書きが公開フィードへ露出する不具合を作った）。

import { KifuSchema } from "@rigel/schema";
import { beforeEach, describe, expect, it } from "vitest";
import type { AnalysisStore } from "../../domain/analysis/analysis-store";
import type { Game } from "../../domain/game/game";
import type { GameLog } from "../../domain/kifu/game-log";
import { User } from "../../domain/user/user";
import { DrizzleGameLogRepository } from "../kifu/drizzle-game-log.repository";
import { DrizzleUserRepository } from "../user/drizzle-user.repository";
import {
  InMemoryAnalysisStore,
  InMemoryGameLogRepository,
  InMemoryGameRepository,
  InMemoryUserRepository,
} from "../../test-support/in-memory";
import { makeTestDb } from "../../test-support/sqlite";
import { DrizzleAnalysisStore } from "./drizzle-analysis-store";

const NOW = new Date("2026-07-12T00:00:00.000Z");

const kifu = KifuSchema.parse({
  schemaVersion: "1.0.0",
  capturedAt: NOW.toISOString(),
  seats: { east: {}, south: {}, west: {}, north: {} },
});

const game = (): Game => ({ id: "g1", userId: "u1", title: "", createdAt: NOW });

const log = (over: Partial<GameLog> = {}): GameLog => ({
  id: "l1",
  userId: "u1",
  gameId: "g1",
  seq: 1,
  kifu,
  visibility: "private",
  status: "draft",
  createdAt: NOW,
  ...over,
});

/** 解析4回ぶんを計上済みのユーザー（コミットで永続化される状態）。 */
function analyzedUser(): User {
  const user = User.create({
    id: "u1",
    googleSub: "sub-1",
    email: "u1@example.com",
    handle: "u1",
    now: NOW,
  });
  user.changePlan("next");
  user.recordGeminiCalls(NOW, 4);
  return user;
}

/** 実装ごとのセットアップ（ストアと、保存結果を読み戻す手段）。 */
interface Subject {
  store: AnalysisStore;
  findLog: (id: string) => Promise<GameLog | null>;
  findUserCount: (id: string) => Promise<number>;
  /** ユーザーを事前に用意する（FK のため）。 */
  seedUser: (user: User) => Promise<void>;
}

const subjects: [name: string, make: () => Subject][] = [
  [
    "DrizzleAnalysisStore（本番・実 SQLite）",
    () => {
      const db = makeTestDb();
      const logs = new DrizzleGameLogRepository(db);
      const users = new DrizzleUserRepository(db);
      return {
        store: new DrizzleAnalysisStore(db),
        findLog: (id) => logs.findById(id),
        findUserCount: async (id) => (await users.findById(id))?.analysisCountThisMonth ?? -1,
        seedUser: (user) => users.save(user),
      };
    },
  ],
  [
    "InMemoryAnalysisStore（テストダブル）",
    () => {
      const games = new InMemoryGameRepository();
      const logs = new InMemoryGameLogRepository();
      const users = new InMemoryUserRepository();
      return {
        store: new InMemoryAnalysisStore(games, logs, users),
        findLog: (id) => logs.findById(id),
        findUserCount: async (id) => (await users.findById(id))?.analysisCountThisMonth ?? -1,
        seedUser: (user) => users.save(user),
      };
    },
  ],
];

describe.each(subjects)("AnalysisStore 契約: %s", (_name, make) => {
  let s: Subject;
  beforeEach(async () => {
    s = make();
    await s.seedUser(analyzedUser());
  });

  it("局のすべてのフィールドを保存する（status/visibility を DB 既定値に落とさない）", async () => {
    const user = analyzedUser();
    await s.store.commit({ newGame: game(), gameLog: log(), user });

    const saved = await s.findLog("l1");
    expect(saved).not.toBeNull();
    // 下書きは下書きのまま保存される。complete に化けると公開フィードへ露出する。
    expect(saved?.status).toBe("draft");
    expect(saved?.visibility).toBe("private");
    expect(saved?.gameId).toBe("g1");
    expect(saved?.seq).toBe(1);
    expect(saved?.kifu.schemaVersion).toBe("1.0.0");
  });

  it("編集済み(complete)・公開(public)の局もそのまま保存する", async () => {
    await s.store.commit({
      newGame: game(),
      gameLog: log({ status: "complete", visibility: "public" }),
      user: analyzedUser(),
    });

    const saved = await s.findLog("l1");
    expect(saved?.status).toBe("complete");
    expect(saved?.visibility).toBe("public");
  });

  it("解析カウントを永続化する（成功時のみ・実呼び出し数）", async () => {
    await s.store.commit({ newGame: game(), gameLog: log(), user: analyzedUser() });
    expect(await s.findUserCount("u1")).toBe(4);
  });

  it("既存半荘への追加（newGame=null）でも局が保存される", async () => {
    await s.store.commit({ newGame: game(), gameLog: log(), user: analyzedUser() });
    await s.store.commit({
      newGame: null,
      gameLog: log({ id: "l2", seq: 2 }),
      user: analyzedUser(),
    });

    expect((await s.findLog("l2"))?.seq).toBe(2);
    expect((await s.findLog("l2"))?.status).toBe("draft");
  });
});
