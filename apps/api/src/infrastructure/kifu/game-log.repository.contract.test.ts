// GameLogRepository の契約テスト（実装非依存）。
// AnalysisStore と同じ方針で、本番の Drizzle 実装（実 SQLite）とテストダブル（InMemory）に
// 同一スイートを流す。ダブルが本物から乖離した瞬間に落ちるのが目的。

import { KifuSchema } from "@rigel/schema";
import { beforeEach, describe, expect, it } from "vitest";
import type { GameLog } from "../../domain/kifu/game-log";
import type { GameLogRepository } from "../../domain/kifu/game-log.repository";
import { User } from "../../domain/user/user";
import { InMemoryGameLogRepository } from "../../test-support/in-memory";
import { makeTestDb } from "../../test-support/sqlite";
import { DrizzleGameRepository } from "../game/drizzle-game.repository";
import { DrizzleUserRepository } from "../user/drizzle-user.repository";
import { DrizzleGameLogRepository } from "./drizzle-game-log.repository";

const NOW = new Date("2026-07-12T00:00:00.000Z");

const kifu = KifuSchema.parse({
  schemaVersion: "1.0.0",
  capturedAt: NOW.toISOString(),
  seats: { east: {}, south: {}, west: {}, north: {} },
});

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

/** 実装ごとのセットアップ（Drizzle は FK のためユーザーと半荘を先に作る）。 */
const subjects: [name: string, make: () => Promise<GameLogRepository>][] = [
  [
    "DrizzleGameLogRepository（本番・実 SQLite）",
    async () => {
      const db = makeTestDb();
      await new DrizzleUserRepository(db).save(
        User.create({ id: "u1", googleSub: "sub-1", now: NOW }),
      );
      await new DrizzleGameRepository(db).save({
        id: "g1",
        userId: "u1",
        title: "",
        createdAt: NOW,
      });
      return new DrizzleGameLogRepository(db);
    },
  ],
  ["InMemoryGameLogRepository（テストダブル）", async () => new InMemoryGameLogRepository()],
];

describe.each(subjects)("GameLogRepository 契約: %s", (_name, make) => {
  let repo: GameLogRepository;
  beforeEach(async () => {
    repo = await make();
  });

  it("保存した局を全フィールドそのまま読み戻せる（status/visibility を落とさない）", async () => {
    await repo.save(log());
    const saved = await repo.findById("l1");
    expect(saved?.status).toBe("draft");
    expect(saved?.visibility).toBe("private");
    expect(saved?.seq).toBe(1);
    expect(saved?.kifu.schemaVersion).toBe("1.0.0");
  });

  it("同じ ID の再保存は上書き（status/visibility の変更も反映される）", async () => {
    await repo.save(log());
    await repo.save(log({ status: "complete", visibility: "public", seq: 3 }));

    const saved = await repo.findById("l1");
    expect(saved?.status).toBe("complete");
    expect(saved?.visibility).toBe("public");
    expect(saved?.seq).toBe(3);
  });

  it("公開フィードは public かつ complete の局だけを返す", async () => {
    await repo.save(log({ id: "l1", status: "draft", visibility: "public" })); // 下書き
    await repo.save(log({ id: "l2", status: "complete", visibility: "private" })); // 非公開
    await repo.save(log({ id: "l3", status: "complete", visibility: "public" })); // これだけ出る

    const rows = await repo.listPublic(10);
    expect(rows.map((r) => r.id)).toEqual(["l3"]);
  });

  it("公開フィードの要約は牌譜本体を読まない（一覧のコストを保存内容から切り離す）", async () => {
    await repo.save(log({ id: "l1", status: "complete", visibility: "public" }));
    await repo.save(log({ id: "l2", status: "draft", visibility: "public" })); // 下書きは出ない

    const rows = await repo.listPublicSummaries(10);
    expect(rows.map((r) => r.id)).toEqual(["l1"]);
    // 一覧に必要なのは所属半荘・著者・時刻だけ。Kifu JSON は読まない（parse もしない）。
    expect(rows[0]).toEqual({
      id: "l1",
      gameId: "g1",
      userId: "u1",
      createdAt: NOW,
    });
  });

  it("編集状態ごとの半荘数を数える（保存上限の判定に使う）", async () => {
    await repo.save(log({ id: "l1", status: "draft" }));
    await repo.save(log({ id: "l2", status: "draft" })); // 同じ半荘 → 1半荘として数える

    expect(await repo.countGamesByUserAndStatus("u1", "draft")).toBe(1);
    expect(await repo.countGamesByUserAndStatus("u1", "complete")).toBe(0);
  });

  it("削除できる（ID 単位）", async () => {
    await repo.save(log());
    await repo.deleteById("l1");
    expect(await repo.findById("l1")).toBeNull();
  });
});
