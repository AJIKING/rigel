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
import { ListMyProblems, ListPublishedProblems } from "../../../application/problem.usecase";
import { GetPublicProfile } from "../../../application/profile.usecase";
import type { AppContainer } from "../../../composition-root";
import { User } from "../../../domain/user/user";
import { JwtSessionService } from "../../../infrastructure/auth/jwt-session-service";
import { DrizzleFavoriteRepository } from "../../../infrastructure/favorite/drizzle-favorite.repository";
import { DrizzleGameRepository } from "../../../infrastructure/game/drizzle-game.repository";
import { DrizzleGameLogRepository } from "../../../infrastructure/kifu/drizzle-game-log.repository";
import { DrizzleProblemRepository } from "../../../infrastructure/problem/drizzle-problem.repository";
import { DrizzleUserRepository } from "../../../infrastructure/user/drizzle-user.repository";
import { fakeEnv, issueTestToken, TEST_SESSION_SECRET } from "../../../test-support/billing";
import { InMemoryAnalysisJobRepository } from "../../../test-support/in-memory-analysis";
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
      photoDraftId: null,
      createdAt: NOW,
    });
  }

  const container = {
    session: new JwtSessionService({ secret: TEST_SESSION_SECRET }),
    setFavorite: new SetFavorite({ favorites, games, gameLogs, problems, now: () => NOW }),
    getFavoriteSummary: new GetFavoriteSummary(favorites),
    listMyFavorites: new ListMyFavorites({ favorites, games, gameLogs, problems, users }),
    listPublicGames: new ListPublicGames(games, gameLogs, users),
    listMyGamesWithCounts: new ListMyGamesWithCounts(
      games,
      gameLogs,
      new InMemoryAnalysisJobRepository(),
    ),
    listPublishedProblems: new ListPublishedProblems(problems),
    listMyProblems: new ListMyProblems(problems),
    getPublicProfile: new GetPublicProfile(users, games, gameLogs),
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

    // 公開牌譜フィードはカーソル方式のページ形 {items, nextCursor}。
    const anon = (await (await call("GET", "/games/public")).json()) as {
      items: { id: string; favoriteCount: number; viewerFaved: boolean }[];
    };
    expect(anon).toMatchObject({
      items: [{ id: "g-pub", favoriteCount: 1, viewerFaved: false }],
      nextCursor: null,
    });

    await call("PUT", "/favorites/game/g-pub", "me");
    const mine = (await (await call("GET", "/games/public", "me")).json()) as {
      items: { favoriteCount: number; viewerFaved: boolean }[];
    };
    expect(mine.items).toMatchObject([{ favoriteCount: 2, viewerFaved: true }]);
  });

  it("マイページの半荘一覧と公開何切る一覧にも載る", async () => {
    const { call } = await makeFavoritesApp();
    await call("PUT", "/favorites/game/g-mine", "me");
    await call("PUT", "/favorites/problem/p-pub", "me");

    // マイページの半荘一覧もカーソル方式のページ形 {items, nextCursor}。
    expect(await (await call("GET", "/me/games", "me")).json()).toMatchObject({
      items: [{ id: "g-mine", favoriteCount: 1, viewerFaved: true }],
      nextCursor: null,
    });
    // 公開何切る一覧はカーソル方式のページ形 {items, nextCursor}。
    expect(await (await call("GET", "/problems", "me")).json()).toMatchObject({
      items: [{ id: "p-pub", favoriteCount: 1, viewerFaved: true }],
      nextCursor: null,
    });
  });
});

// ルート → reasonStatus("invalid") → 400 の配線を全一覧エンドポイントで固定する
// （"invalid" は reasonStatus の default 分岐なので、型でもユニットテストでも守られない）。
describe("一覧の ?cursor: 不正カーソルは 400", () => {
  it.each<{ name: string; path: string; userId?: string }>([
    { name: "GET /games/public", path: "/games/public?cursor=junk" },
    { name: "GET /me/games", path: "/me/games?cursor=junk", userId: "me" },
    { name: "GET /problems", path: "/problems?cursor=junk" },
    { name: "GET /problems/mine", path: "/problems/mine?cursor=junk", userId: "me" },
    { name: "GET /favorites", path: "/favorites?cursor=junk", userId: "me" },
    { name: "GET /users/:idOrHandle/profile", path: "/users/hother/profile?cursor=junk" },
  ])("$name", async ({ path, userId }) => {
    const { call } = await makeFavoritesApp();
    const res = await call("GET", path, userId);
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ ok: false, reason: "invalid" });
  });
});
