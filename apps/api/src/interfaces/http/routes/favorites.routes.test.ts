// /favorites の HTTP 統合テスト（ルート → 実ユースケース → 実 Drizzle リポジトリ(sql.js)）。
// 付ける/外すの冪等性、見えない対象は 404（存在を漏らさない）、一覧が「今も見られるもの」だけを
// 返すこと、そして一覧カードに favoriteCount / viewerFaved が載ることを固定する。
// 「誰が付けたか」を返す口はどのレスポンスにも無い。

import { describe, expect, it } from "vitest";
import {
  GetFavoriteSummary,
  ListMyFavorites,
  SetFavorite,
} from "../../../application/favorite.usecase";
import {
  ListMyGamesWithCounts,
  ListPublicGames,
} from "../../../application/list-game-cards.usecase";
import { ListPublishedProblems } from "../../../application/problem.usecase";
import type { AppContainer } from "../../../composition-root";
import { User } from "../../../domain/user/user";
import { JwtSessionService } from "../../../infrastructure/auth/jwt-session-service";
import { DrizzleFavoriteRepository } from "../../../infrastructure/favorite/drizzle-favorite.repository";
import { DrizzleGameRepository } from "../../../infrastructure/game/drizzle-game.repository";
import { DrizzleGameLogRepository } from "../../../infrastructure/kifu/drizzle-game-log.repository";
import { DrizzleProblemRepository } from "../../../infrastructure/problem/drizzle-problem.repository";
import { DrizzleUserRepository } from "../../../infrastructure/user/drizzle-user.repository";
import { fakeEnv, issueTestToken, TEST_SESSION_SECRET } from "../../../test-support/billing";
import { validKifu } from "../../../test-support/kifu";
import { makeProblemData } from "../../../test-support/problem";
import { makeTestDb } from "../../../test-support/sqlite";
import { createApp } from "../app";

const NOW = new Date("2026-07-26T00:00:00.000Z");

/**
 * 実ユースケース＋実 Drizzle リポジトリのアプリ。世界は favorite.usecase.test と同じ形:
 *   g-pub(other・公開) / g-priv(other・非公開) / g-mine(me・非公開下書き)
 *   p-pub(other・公開) / p-draft(other・下書き)
 */
async function makeFavoritesApp() {
  const db = makeTestDb();
  const users = new DrizzleUserRepository(db);
  for (const id of ["me", "other"]) {
    const u = User.create({ id, googleSub: `sub-${id}`, now: NOW });
    u.updateProfile({ handle: `h${id}`, displayName: `名前${id}` });
    await users.save(u);
  }

  const games = new DrizzleGameRepository(db);
  const gameLogs = new DrizzleGameLogRepository(db);
  const problems = new DrizzleProblemRepository(db);
  const favorites = new DrizzleFavoriteRepository(db);

  await games.save({ id: "g-pub", userId: "other", title: "公開半荘", createdAt: NOW });
  await games.save({ id: "g-priv", userId: "other", title: "非公開半荘", createdAt: NOW });
  await games.save({ id: "g-mine", userId: "me", title: "自分の半荘", createdAt: NOW });
  const log = (id: string, gameId: string, userId: string, pub: boolean) => ({
    id,
    userId,
    gameId,
    seq: 1,
    kifu: validKifu,
    visibility: pub ? ("public" as const) : ("private" as const),
    status: pub ? ("complete" as const) : ("draft" as const),
    createdAt: NOW,
  });
  await gameLogs.save(log("l1", "g-pub", "other", true));
  await gameLogs.save(log("l2", "g-priv", "other", false));
  await gameLogs.save(log("l3", "g-mine", "me", false));

  for (const [id, userId, status] of [
    ["p-pub", "other", "published"],
    ["p-draft", "other", "draft"],
  ] as const) {
    await problems.save({
      id,
      userId,
      title: `問題${id}`,
      problem: makeProblemData(),
      status,
      createdAt: NOW,
    });
  }

  const container = {
    session: new JwtSessionService({ secret: TEST_SESSION_SECRET }),
    setFavorite: new SetFavorite({ favorites, games, gameLogs, problems, now: () => NOW }),
    getFavoriteSummary: new GetFavoriteSummary(favorites),
    listMyFavorites: new ListMyFavorites({ favorites, games, gameLogs, problems, users }),
    listPublicGames: new ListPublicGames(games, gameLogs, users),
    listMyGamesWithCounts: new ListMyGamesWithCounts(games, gameLogs),
    listPublishedProblems: new ListPublishedProblems(problems),
  } as Partial<AppContainer> as AppContainer;
  const app = createApp({ container: () => container });

  const call = async (method: string, path: string, userId?: string) =>
    app.request(
      path,
      {
        method,
        headers: userId ? { authorization: `Bearer ${await issueTestToken(userId)}` } : {},
      },
      fakeEnv,
    );
  return { call, favorites };
}

describe("PUT / DELETE /favorites/:type/:id", () => {
  it("トークン無しは 401（お気に入りは本人に紐づく）", async () => {
    const { call } = await makeFavoritesApp();
    expect((await call("PUT", "/favorites/game/g-pub")).status).toBe(401);
  });

  it("公開されている対象に付けられ、件数を返す。二度押しでも増えない（冪等）", async () => {
    const { call } = await makeFavoritesApp();
    const first = await call("PUT", "/favorites/game/g-pub", "me");
    expect(first.status).toBe(200);
    expect(await first.json()).toEqual({ ok: true, faved: true, favoriteCount: 1 });
    expect(await (await call("PUT", "/favorites/game/g-pub", "me")).json()).toEqual({
      ok: true,
      faved: true,
      favoriteCount: 1,
    });
  });

  it("外すと 0 に戻る。付いていない状態で外しても 200（冪等）", async () => {
    const { call } = await makeFavoritesApp();
    await call("PUT", "/favorites/problem/p-pub", "me");
    expect(await (await call("DELETE", "/favorites/problem/p-pub", "me")).json()).toEqual({
      ok: true,
      faved: false,
      favoriteCount: 0,
    });
    expect((await call("DELETE", "/favorites/problem/p-pub", "me")).status).toBe(200);
  });

  it("他人の非公開・下書き・不存在はすべて 404（存在の有無を漏らさない）", async () => {
    const { call } = await makeFavoritesApp();
    for (const path of [
      "/favorites/game/g-priv",
      "/favorites/game/missing",
      "/favorites/problem/p-draft",
      "/favorites/problem/missing",
    ]) {
      expect((await call("PUT", path, "me")).status).toBe(404);
    }
  });

  it("未知の種別は 400（DB へ届かせない）", async () => {
    const { call } = await makeFavoritesApp();
    expect((await call("PUT", "/favorites/user/other", "me")).status).toBe(400);
  });
});

describe("GET /favorites（マイページのお気に入りタブ）", () => {
  it("他人の公開物と自分のもの（非公開含む）を返し、mine と件数を載せる", async () => {
    const { call } = await makeFavoritesApp();
    await call("PUT", "/favorites/game/g-pub", "me");
    await call("PUT", "/favorites/game/g-pub", "other");
    await call("PUT", "/favorites/game/g-mine", "me");
    await call("PUT", "/favorites/problem/p-pub", "me");

    const body = (await (await call("GET", "/favorites", "me")).json()) as {
      games: { id: string; mine: boolean; favoriteCount: number; ownerHandle: string | null }[];
      problems: { id: string; mine: boolean }[];
    };
    expect(body.games.map((g) => g.id).sort()).toEqual(["g-mine", "g-pub"]);
    expect(body.games.find((g) => g.id === "g-pub")).toMatchObject({
      mine: false,
      favoriteCount: 2,
      ownerHandle: "hother",
    });
    expect(body.problems).toMatchObject([{ id: "p-pub", mine: false }]);
  });

  it("返すのは件数と自分の状態だけ（誰が付けたかを載せるキーは存在しない）", async () => {
    const { call } = await makeFavoritesApp();
    await call("PUT", "/favorites/game/g-pub", "me");
    await call("PUT", "/favorites/game/g-pub", "other");
    await call("PUT", "/favorites/problem/p-pub", "me");

    const body = (await (await call("GET", "/favorites", "me")).json()) as {
      games: Record<string, unknown>[];
      problems: Record<string, unknown>[];
    };
    // キーはホワイトリスト。favoritedBy のような「付けた人」を含む口を増やさない。
    expect(Object.keys(body.games[0]!).sort()).toEqual(
      [
        "createdAt",
        "favoriteCount",
        "firstLogId",
        "kyokuCount",
        "mine",
        "viewerFaved",
        "ownerHandle",
        "ownerId",
        "ownerName",
        "title",
        "id",
      ].sort(),
    );
    expect(Object.keys(body.problems[0]!).sort()).toEqual(
      [
        "createdAt",
        "favoriteCount",
        "id",
        "mine",
        "viewerFaved",
        "ownerHandle",
        "ownerName",
        "problem",
        "status",
        "title",
        // 著者（= 公開情報。既存の /problems と同じ）。お気に入りした人ではない。
        "userId",
      ].sort(),
    );
  });
});

describe("一覧カードのお気に入り情報", () => {
  it("公開牌譜フィードに favoriteCount と viewerFaved が載る（未ログインは false）", async () => {
    const { call } = await makeFavoritesApp();
    await call("PUT", "/favorites/game/g-pub", "other");

    const anon = (await (await call("GET", "/games/public")).json()) as {
      id: string;
      favoriteCount: number;
      viewerFaved: boolean;
    }[];
    expect(anon).toMatchObject([{ id: "g-pub", favoriteCount: 1, viewerFaved: false }]);

    await call("PUT", "/favorites/game/g-pub", "me");
    const mine = (await (await call("GET", "/games/public", "me")).json()) as {
      favoriteCount: number;
      viewerFaved: boolean;
    }[];
    expect(mine).toMatchObject([{ favoriteCount: 2, viewerFaved: true }]);
  });

  it("マイページの半荘一覧と公開何切る一覧にも載る", async () => {
    const { call } = await makeFavoritesApp();
    await call("PUT", "/favorites/game/g-mine", "me");
    await call("PUT", "/favorites/problem/p-pub", "me");

    expect(await (await call("GET", "/me/games", "me")).json()).toMatchObject([
      { id: "g-mine", favoriteCount: 1, viewerFaved: true },
    ]);
    expect(await (await call("GET", "/problems", "me")).json()).toMatchObject([
      { id: "p-pub", favoriteCount: 1, viewerFaved: true },
    ]);
  });
});
