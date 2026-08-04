// DrizzleGameRepository の契約テスト（sql.js = 実 SQLite + 実 migration）。
// 兄弟リポジトリ（game-log / favorite / quiz-session / analysis-store）は契約テストを
// 持つのにここだけ無かった穴（2026-08-01 品質調査）。特に危ないのは:
//   - save の upsert が更新するのは title/createdAt だけ（userId を乗っ取れない）
//   - deleteByUser（退会カスケードの一部）が本人の半荘だけ消すこと

import { describe, expect, it } from "vitest";
import { User } from "../../domain/user/user";
import { makeTestDb } from "../../test-support/sqlite";
import { DrizzleUserRepository } from "../user/drizzle-user.repository";
import { DrizzleGameRepository } from "./drizzle-game.repository";

const NOW = new Date("2026-08-02T00:00:00.000Z");
const LATER = new Date("2026-08-03T00:00:00.000Z");

async function makeRepo() {
  const db = makeTestDb();
  const users = new DrizzleUserRepository(db);
  for (const id of ["u1", "u2"]) {
    await users.save(User.create({ id, googleSub: `sub-${id}`, now: NOW }));
  }
  return new DrizzleGameRepository(db);
}

describe("DrizzleGameRepository（実 SQLite）", () => {
  it("save → findById / listByUser が往復する", async () => {
    const repo = await makeRepo();
    await repo.save({ id: "g1", userId: "u1", title: "友人戦", createdAt: NOW });

    expect(await repo.findById("g1")).toMatchObject({ id: "g1", userId: "u1", title: "友人戦" });
    expect((await repo.listByUser("u1")).map((g) => g.id)).toEqual(["g1"]);
    expect(await repo.listByUser("u2")).toEqual([]);
  });

  it("同じ id の save は title だけ更新し、userId/createdAt は書き換えない（乗っ取り・日付改変防止）", async () => {
    const repo = await makeRepo();
    await repo.save({ id: "g1", userId: "u1", title: "元の名前", createdAt: NOW });

    // 別ユーザーの userId・別の作成日で同 id を保存しようとしても、title 以外は変わらない
    // （対局日の変更は updateGame の専用経路のみ）。
    await repo.save({ id: "g1", userId: "u2", title: "改名後", createdAt: LATER });

    const game = await repo.findById("g1");
    expect(game?.title).toBe("改名後");
    expect(game?.createdAt).toEqual(NOW); // 凍結
    expect(game?.userId).toBe("u1"); // 凍結
  });

  it("listByUserPage はカーソル（同時刻は id DESC）で重複なく続きを引ける", async () => {
    const repo = await makeRepo();
    // 同時刻3件（id DESC → g3, g2, g1）＋古い1件＋他人の1件（混ざらない）。
    for (const id of ["g1", "g2", "g3"]) {
      await repo.save({ id, userId: "u1", title: "", createdAt: NOW });
    }
    await repo.save({ id: "older", userId: "u1", title: "", createdAt: new Date(NOW.getTime() - 60_000) }); // prettier-ignore
    await repo.save({ id: "g9", userId: "u2", title: "", createdAt: LATER });

    const page1 = await repo.listByUserPage("u1", 2, null);
    expect(page1.map((g) => g.id)).toEqual(["g3", "g2"]);

    const last = page1[page1.length - 1]!;
    const page2 = await repo.listByUserPage("u1", 10, {
      ms: last.createdAt.getTime(),
      id: last.id,
    });
    expect(page2.map((g) => g.id)).toEqual(["g1", "older"]);
  });

  it("deleteByUser は本人の半荘だけ消す（退会カスケードの一部）", async () => {
    const repo = await makeRepo();
    await repo.save({ id: "g1", userId: "u1", title: "", createdAt: NOW });
    await repo.save({ id: "g2", userId: "u1", title: "", createdAt: NOW });
    await repo.save({ id: "g3", userId: "u2", title: "", createdAt: NOW });

    await repo.deleteByUser("u1");

    expect(await repo.findById("g1")).toBeNull();
    expect(await repo.findById("g2")).toBeNull();
    expect(await repo.findById("g3")).not.toBeNull();
  });
});
