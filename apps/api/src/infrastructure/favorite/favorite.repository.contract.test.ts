// DrizzleFavoriteRepository の契約テスト（sql.js = 実 SQLite + 実 migration）。
// お気に入りは「1人1対象1件・二度押しは冪等」「件数は対象ごと」「自分の分だけ引ける」を
// 本物のクエリで固定する。誰が付けたかを返す口はここにも作らない。

import { describe, expect, it } from "vitest";
import { User } from "../../domain/user/user";
import { makeTestDb } from "../../test-support/sqlite";
import { DrizzleUserRepository } from "../user/drizzle-user.repository";
import { DrizzleFavoriteRepository } from "./drizzle-favorite.repository";

const NOW = new Date("2026-07-24T03:00:00.000Z");

async function makeRepo() {
  const db = makeTestDb();
  const users = new DrizzleUserRepository(db);
  for (const id of ["u1", "u2", "u3"]) {
    await users.save(User.create({ id, googleSub: `sub-${id}`, now: NOW }));
  }
  return new DrizzleFavoriteRepository(db);
}

/** お気に入り1件（既定は u1 が半荘 g1 を NOW に付ける）。 */
function fav(over: Partial<Parameters<DrizzleFavoriteRepository["add"]>[0]> = {}) {
  return {
    userId: "u1",
    targetType: "game" as const,
    targetId: "g1",
    createdAt: NOW,
    ...over,
  };
}

/** カーソル無しで全件引く（一覧の並びの検証用）。 */
function listAll(repo: DrizzleFavoriteRepository, userId: string) {
  return repo.listByUserPage(userId, 100, null);
}

describe("DrizzleFavoriteRepository（実 SQLite）", () => {
  it("add は同じ (user,type,id) を二度押ししても1件（PK 衝突で落ちない＝冪等）", async () => {
    const repo = await makeRepo();
    await repo.add(fav());
    await repo.add(fav({ createdAt: new Date(NOW.getTime() + 1000) }));
    expect(await repo.countsByTargets("game", ["g1"])).toEqual({ g1: 1 });
    // 最初に付けた時刻を保つ（並べ替えが二度押しで変わらない）。
    expect((await listAll(repo, "u1"))[0]!.createdAt).toEqual(NOW);
  });

  it("remove は付いていなくても落ちない（冪等）。付いていれば消える", async () => {
    const repo = await makeRepo();
    await repo.remove("u1", "game", "g1");
    await repo.add(fav());
    await repo.remove("u1", "game", "g1");
    expect(await repo.countsByTargets("game", ["g1"])).toEqual({});
  });

  it("countsByTargets は対象ごとの件数（0件の対象はキーを省く・種別を跨がない）", async () => {
    const repo = await makeRepo();
    await repo.add(fav({ userId: "u1", targetId: "g1" }));
    await repo.add(fav({ userId: "u2", targetId: "g1" }));
    await repo.add(fav({ userId: "u3", targetId: "g2" }));
    // 種別違いで同じ id が同居しても混ざらない。
    await repo.add(fav({ userId: "u1", targetType: "problem", targetId: "g1" }));

    expect(await repo.countsByTargets("game", ["g1", "g2", "g3"])).toEqual({ g1: 2, g2: 1 });
    expect(await repo.countsByTargets("problem", ["g1"])).toEqual({ g1: 1 });
    expect(await repo.countsByTargets("game", [])).toEqual({});
  });

  it("findMineIn は自分が付けている targetId だけを返す（他人の分は混ざらない）", async () => {
    const repo = await makeRepo();
    await repo.add(fav({ userId: "u1", targetId: "g1" }));
    await repo.add(fav({ userId: "u2", targetId: "g2" }));

    expect([...(await repo.findMineIn("u1", "game", ["g1", "g2"]))]).toEqual(["g1"]);
    expect([...(await repo.findMineIn("u2", "game", ["g1", "g2"]))]).toEqual(["g2"]);
    expect([...(await repo.findMineIn("u1", "game", []))]).toEqual([]);
  });

  it("listByUserPage は自分の分だけを新しい順に返す", async () => {
    const repo = await makeRepo();
    await repo.add(fav({ targetId: "old", createdAt: new Date(NOW.getTime() - 60_000) }));
    await repo.add(fav({ targetId: "new", createdAt: NOW }));
    await repo.add(fav({ userId: "u2", targetId: "other" }));

    expect((await listAll(repo, "u1")).map((f) => f.targetId)).toEqual(["new", "old"]);
  });

  it("listByUserPage はカーソル（同時刻は targetType:targetId DESC）で重複なく続きを引ける", async () => {
    const repo = await makeRepo();
    // 同時刻3件（複合キー DESC → problem:p1, game:g2, game:g1）＋古い1件。
    await repo.add(fav({ targetId: "g1" }));
    await repo.add(fav({ targetId: "g2" }));
    await repo.add(fav({ targetType: "problem", targetId: "p1" }));
    await repo.add(fav({ targetId: "older", createdAt: new Date(NOW.getTime() - 60_000) }));

    const page1 = await repo.listByUserPage("u1", 2, null);
    expect(page1.map((f) => `${f.targetType}:${f.targetId}`)).toEqual(["problem:p1", "game:g2"]);

    const last = page1[page1.length - 1]!;
    const page2 = await repo.listByUserPage("u1", 10, {
      ms: last.createdAt.getTime(),
      id: `${last.targetType}:${last.targetId}`,
    });
    expect(page2.map((f) => `${f.targetType}:${f.targetId}`)).toEqual(["game:g1", "game:older"]);
  });

  it("deleteByTarget は1対象の全員ぶんを消す（対象削除で孤児を残さない）", async () => {
    const repo = await makeRepo();
    await repo.add(fav({ userId: "u1", targetId: "g1" }));
    await repo.add(fav({ userId: "u2", targetId: "g1" }));
    await repo.add(fav({ userId: "u1", targetId: "g2" }));

    await repo.deleteByTarget("game", "g1");
    expect(await repo.countsByTargets("game", ["g1", "g2"])).toEqual({ g2: 1 });
  });

  it("deleteByUser は自分が付けた全件を消す（退会時。他人の分は残る）", async () => {
    const repo = await makeRepo();
    await repo.add(fav({ userId: "u1", targetId: "g1" }));
    await repo.add(fav({ userId: "u1", targetType: "problem", targetId: "p1" }));
    await repo.add(fav({ userId: "u2", targetId: "g1" }));

    await repo.deleteByUser("u1");
    expect(await listAll(repo, "u1")).toEqual([]);
    expect(await repo.countsByTargets("game", ["g1"])).toEqual({ g1: 1 });
    expect(await repo.countsByTargets("problem", ["p1"])).toEqual({});
  });
});
