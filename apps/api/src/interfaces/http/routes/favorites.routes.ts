// interfaces/http/routes — お気に入り（★）のルート（全て認証必須）。
// 付ける（PUT）/ 外す（DELETE）/ 自分のお気に入り一覧（GET）。
// レスポンスに出すのは件数と自分の状態だけで、誰が付けたかは返さない。

import type { Hono } from "hono";
import type { FavoriteTargetType } from "../../../domain/favorite/favorite.repository";
import { reasonStatus, requireAuth, type AppEnv } from "../shared";

/** パスの :type を検証する（未知の種別は 400 で弾き、DB へ届かせない）。 */
function parseTargetType(v: string): FavoriteTargetType | null {
  return v === "game" || v === "problem" ? v : null;
}

export function registerFavoriteRoutes(app: Hono<AppEnv>): void {
  // 自分のお気に入り一覧（半荘・何切るをまとめて。他人の投稿も含む。カーソル方式 ?cursor=）。
  // 非公開に戻された・削除された対象はユースケース側で落ちる。
  app.get("/favorites", requireAuth, async (c) => {
    const result = await c
      .get("container")
      .listMyFavorites.execute(c.get("userId")!, c.req.query("cursor"));
    if (!result.ok)
      return c.json({ ok: false, reason: result.reason }, reasonStatus(result.reason));
    const { games, problems } = result;
    return c.json({
      nextCursor: result.nextCursor,
      games: games.map((g) => ({
        id: g.id,
        ownerId: g.ownerId,
        ownerHandle: g.ownerHandle,
        ownerName: g.ownerName,
        title: g.title,
        createdAt: g.createdAt.toISOString(),
        kyokuCount: g.kyokuCount,
        firstLogId: g.firstLogId,
        favoriteCount: g.favoriteCount,
        // 一覧に出ている時点で自分が付けている。他の一覧カードと同じ形にして
        // クライアントが★の状態を出し分けずに済むようにする。
        viewerFaved: true,
        mine: g.mine,
      })),
      problems: problems.map((p) => ({
        id: p.id,
        userId: p.userId,
        ownerHandle: p.ownerHandle,
        ownerName: p.ownerName,
        title: p.title,
        problem: p.problem,
        status: p.status,
        createdAt: p.createdAt.toISOString(),
        favoriteCount: p.favoriteCount,
        viewerFaved: true,
        mine: p.mine,
      })),
    });
  });

  // 付ける / 外す。冪等（二度押ししても件数は動かない）。
  // 自分に見えない対象（他人の非公開・下書き・不存在）はすべて 404（存在を漏らさない）。
  for (const [method, faved] of [
    ["put", true],
    ["delete", false],
  ] as const) {
    app[method]("/favorites/:type/:id", requireAuth, async (c) => {
      const targetType = parseTargetType(c.req.param("type"));
      if (!targetType) return c.json({ error: "type は game か problem" }, 400);
      const result = await c.get("container").setFavorite.execute({
        userId: c.get("userId")!,
        targetType,
        targetId: c.req.param("id"),
        faved,
      });
      if (!result.ok)
        return c.json({ ok: false, reason: result.reason }, reasonStatus(result.reason));
      return c.json({ ok: true, faved, favoriteCount: result.favoriteCount });
    });
  }
}
