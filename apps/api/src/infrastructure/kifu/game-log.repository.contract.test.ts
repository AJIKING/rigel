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
      // FK のため半荘を先に作る（g2/g3 は公開フィードのページング契約テスト用）。
      const games = new DrizzleGameRepository(db);
      for (const id of ["g1", "g2", "g3"]) {
        await games.save({ id, userId: "u1", title: "", createdAt: NOW });
      }
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

  it("公開フィードの半荘グループ: 公開×編集済だけを数え、最新公開局の時刻順に畳む（Kifu 本体は読まない）", async () => {
    const t = (m: number) => new Date(NOW.getTime() + m * 60_000);
    // g1: 公開2局（最新は l2）＋下書き1局（数えない）。g2: 公開1局（より新しい）。
    await repo.save(log({ id: "l1", status: "complete", visibility: "public", createdAt: t(1) }));
    await repo.save(
      log({ id: "l2", status: "complete", visibility: "public", seq: 2, createdAt: t(3) }),
    );
    await repo.save(log({ id: "l3", status: "draft", visibility: "public", seq: 3 })); // 下書きは出ない
    await repo.save(
      log({ id: "l4", gameId: "g2", status: "complete", visibility: "public", createdAt: t(5) }),
    );

    const rows = await repo.listPublicGameGroups(10, null);
    expect(rows.map((r) => r.gameId)).toEqual(["g2", "g1"]); // 最新公開局の時刻順
    expect(rows[1]).toEqual({
      gameId: "g1",
      latestAt: t(3),
      latestLogId: "l2", // 最新公開局の id
      publicCount: 2, // 下書き・非公開は数えない
    });
  });

  it("公開フィードの半荘グループ: カーソルで続きへ・同時刻は gameId タイブレーク", async () => {
    const t = (m: number) => new Date(NOW.getTime() + m * 60_000);
    // g2 と g3 は同時刻（gameId DESC → g3 が先）・g1 が最新。
    await repo.save(log({ id: "l1", gameId: "g1", status: "complete", visibility: "public", createdAt: t(9) })); // prettier-ignore
    await repo.save(log({ id: "l2", gameId: "g2", status: "complete", visibility: "public", createdAt: t(5) })); // prettier-ignore
    await repo.save(log({ id: "l3", gameId: "g3", status: "complete", visibility: "public", createdAt: t(5) })); // prettier-ignore

    const page1 = await repo.listPublicGameGroups(2, null);
    expect(page1.map((r) => r.gameId)).toEqual(["g1", "g3"]);
    const last = page1[1]!;
    const page2 = await repo.listPublicGameGroups(2, {
      ms: last.latestAt.getTime(),
      id: last.gameId,
    });
    expect(page2.map((r) => r.gameId)).toEqual(["g2"]); // 同時刻の残りが正しく続く
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
