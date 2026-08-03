// interfaces/http/routes — 半荘（Game）のルート。
// 一覧・公開フィード・詳細・作成（空の初局）・名称/公開範囲/ルール変更・削除。
// 公開/非公開・ルール・保存上限は半荘単位で扱う（局ごとに持たない）。

import { KifuSchema, PlayersSchema, RulesSchema, SeatSchema } from "@rigel/schema";
import type { Context, Hono } from "hono";
import { isPhotoKind } from "../../../application/game-photos.usecase";
import { MAX_SEQ } from "../../../application/update-kifu.usecase";
import { reasonStatus, requireAuth, withFavorites, type AppEnv } from "../shared";

/** 空の局を作る POST 共通処理。gameId 無し=新半荘、有り=既存半荘に追加。
 *  body: { cameraBottomSeat, meta?: { honba, kyotaku, dora, junme } }。meta は記録のみ。 */
async function createEmptyKifuRoute(c: Context<AppEnv>, gameId?: string) {
  const body = (await c.req.json().catch(() => null)) as {
    cameraBottomSeat?: unknown;
    meta?: unknown;
    seq?: unknown;
  } | null;
  const seat = SeatSchema.safeParse(body?.cameraBottomSeat);
  const meta = KifuSchema.shape.meta.safeParse(body?.meta);
  const seq =
    typeof body?.seq === "number" &&
    Number.isInteger(body.seq) &&
    body.seq >= 1 &&
    body.seq <= MAX_SEQ
      ? body.seq
      : undefined;
  const result = await c.get("container").createEmptyKifu.execute({
    userId: c.get("userId")!,
    gameId,
    cameraBottomSeat: seat.success ? seat.data : "east",
    meta: meta.success ? meta.data : undefined,
    seq,
  });
  if (!result.ok) {
    return c.json({ ok: false, reason: result.reason }, reasonStatus(result.reason));
  }
  return c.json({ ok: true, gameId: result.gameId, logId: result.logId }, 201);
}

export function registerGameRoutes(app: Hono<AppEnv>): void {
  // ログインユーザーの半荘一覧。
  app.get("/games", requireAuth, async (c) => {
    const games = await c.get("container").listGames.execute(c.get("userId")!);
    return c.json(games);
  });

  // 半荘の元写真の一覧（恒久保存・所有者のみ。[決定] 2026-08-03 photo-retention.md）。
  // 公開半荘でも写真は露出しない。他人・不存在は 404（存在を漏らさない）。
  app.get("/games/:id/photos", requireAuth, async (c) => {
    const photos = await c
      .get("container")
      .listGamePhotos.execute(c.req.param("id"), c.get("userId")!);
    if (!photos) return c.json({ error: "not found" }, 404);
    return c.json({ photos });
  });

  // 元写真のバイト配信（所有者のみ）。kind は許可リスト（任意キー読み出しの口にしない）。
  app.get("/games/:id/photos/:jobId/:kind", requireAuth, async (c) => {
    const kind = c.req.param("kind");
    if (!isPhotoKind(kind)) return c.json({ error: "not found" }, 404);
    const photo = await c.get("container").getGamePhoto.execute({
      gameId: c.req.param("id"),
      jobId: c.req.param("jobId"),
      kind,
      viewerId: c.get("userId")!,
    });
    if (!photo) return c.json({ error: "not found" }, 404);
    return c.body(photo.data, 200, {
      "content-type": photo.mimeType,
      // 本人専用・不変オブジェクト。ブラウザキャッシュは許可（共有キャッシュには乗せない）。
      "cache-control": "private, max-age=86400",
    });
  });

  // 公開牌譜フィード: 公開局を含む半荘を新着順に（全ユーザー・閲覧は自由）。
  // カードにはお気に入り数（人気順の並べ替えに使う）と自分が付けたかを載せる。
  app.get("/games/public", async (c) => {
    const cards = await c.get("container").listPublicGames.execute();
    return c.json(await withFavorites(c, "game", cards));
  });

  // 公開半荘の取得（読み取り専用ビューア用。公開局＋所有者表示。閲覧は自由）。
  app.get("/games/:id/public", async (c) => {
    const detail = await c.get("container").getPublicGameDetail.execute(c.req.param("id"));
    if (!detail) return c.json({ error: "not found" }, 404);
    const [favorite] = await withFavorites(c, "game", [{ id: detail.game.id }]);
    return c.json({
      ...detail,
      favoriteCount: favorite!.favoriteCount,
      viewerFaved: favorite!.viewerFaved,
    });
  });

  // 半荘名・対局日の変更。所有者のみ。body: { title?, createdAt? }（少なくとも一方）。
  app.patch("/games/:id", requireAuth, async (c) => {
    const body = await c.req
      .json<{ title?: unknown; createdAt?: unknown }>()
      .catch(() => ({}) as { title?: unknown; createdAt?: unknown });
    const title = typeof body.title === "string" ? body.title : undefined;
    const createdAt = typeof body.createdAt === "string" ? body.createdAt : undefined;
    if (title === undefined && createdAt === undefined) {
      return c.json({ error: "title or createdAt required" }, 400);
    }
    const result = await c.get("container").updateGame.execute({
      userId: c.get("userId")!,
      gameId: c.req.param("id"),
      title,
      createdAt,
    });
    if (!result.ok)
      return c.json({ error: result.reason }, result.reason === "invalid" ? 400 : 404);
    return c.json({ ok: true });
  });

  // 半荘の公開範囲の変更（配下の全局に反映）。所有者のみ。公開/非公開は半荘単位で決める。
  // private 化が無料の非公開上限（半荘数）を超えるときは 403。
  app.patch("/games/:id/visibility", requireAuth, async (c) => {
    const body = (await c.req.json().catch(() => null)) as { visibility?: unknown } | null;
    if (body?.visibility !== "public" && body?.visibility !== "private") {
      return c.json({ error: "visibility は public か private" }, 400);
    }
    const result = await c.get("container").updateGameVisibility.execute({
      userId: c.get("userId")!,
      gameId: c.req.param("id"),
      visibility: body.visibility,
    });
    if (!result.ok) {
      return c.json({ ok: false, reason: result.reason }, reasonStatus(result.reason));
    }
    return c.json({ ok: true });
  });

  // 半荘の編集状態（下書き/編集済）の変更（配下の全局に反映）。所有者のみ。半荘単位で決める。
  app.patch("/games/:id/status", requireAuth, async (c) => {
    const body = (await c.req.json().catch(() => null)) as { status?: unknown } | null;
    if (body?.status !== "draft" && body?.status !== "complete") {
      return c.json({ error: "status は draft か complete" }, 400);
    }
    const result = await c.get("container").updateGameStatus.execute({
      userId: c.get("userId")!,
      gameId: c.req.param("id"),
      status: body.status,
    });
    if (!result.ok) {
      return c.json({ ok: false, reason: result.reason }, reasonStatus(result.reason));
    }
    return c.json({ ok: true });
  });

  // 半荘のルール変更（配下の全局に反映）。所有者のみ。ルールは局ごとに持たず半荘で共有する。
  app.patch("/games/:id/rules", requireAuth, async (c) => {
    const body = (await c.req.json().catch(() => null)) as { rules?: unknown } | null;
    const parsed = RulesSchema.safeParse(body?.rules);
    if (!parsed.success) return c.json({ error: "invalid rules" }, 400);
    const result = await c.get("container").updateGameRules.execute({
      userId: c.get("userId")!,
      gameId: c.req.param("id"),
      rules: parsed.data,
    });
    if (!result.ok) return c.json({ error: "not found" }, 404);
    return c.json({ ok: true });
  });

  // 半荘の選手情報変更（配下の全局に反映）。所有者のみ。rules と同じく半荘単位。
  app.patch("/games/:id/players", requireAuth, async (c) => {
    const body = (await c.req.json().catch(() => null)) as { players?: unknown } | null;
    // キー欠落（typo 等）と明示的 null（=記録を消す）を区別する。欠落を null 扱いに
    // すると、クライアントのバグが選手情報のサイレント全消去として成立してしまう。
    if (!body || !("players" in body)) return c.json({ error: "players required" }, 400);
    const parsed = PlayersSchema.nullable().safeParse(body.players);
    if (!parsed.success) return c.json({ error: "invalid players" }, 400);
    const result = await c.get("container").updateGamePlayers.execute({
      userId: c.get("userId")!,
      gameId: c.req.param("id"),
      players: parsed.data,
    });
    if (!result.ok) return c.json({ error: "not found" }, 404);
    return c.json({ ok: true });
  });

  // 半荘の削除（配下の全局ごと）。所有者のみ。
  app.delete("/games/:id", requireAuth, async (c) => {
    const result = await c
      .get("container")
      .deleteGame.execute({ userId: c.get("userId")!, gameId: c.req.param("id") });
    if (!result.ok) return c.json({ error: "not found" }, 404);
    return c.json({ ok: true });
  });

  // 半荘詳細（半荘 + 局一覧）。所有者のみ（所有者判定は application 層。
  // 他人には不存在と同じ 404 で存在を漏らさない）。
  app.get("/games/:id", requireAuth, async (c) => {
    const detail = await c
      .get("container")
      .getGameWithLogs.execute(c.req.param("id"), c.get("userId")!);
    if (!detail) return c.json({ error: "not found" }, 404);
    // 所有者の非公開プレビュー（/k/[gameId]）でも★の状態を正しく出すため一緒に返す。
    const [favorite] = await withFavorites(c, "game", [{ id: detail.game.id }]);
    return c.json({
      ...detail,
      favoriteCount: favorite!.favoriteCount,
      viewerFaved: favorite!.viewerFaved,
    });
  });

  // 新しい半荘を「空の初局」つきで作る（手動入力の起点）。
  app.post("/games", requireAuth, (c) => createEmptyKifuRoute(c));

  // 既存の半荘に空の局を追加（手動入力の起点。所有者のみ）。body: { cameraBottomSeat }。
  app.post("/games/:id/kifu", requireAuth, (c) => createEmptyKifuRoute(c, c.req.param("id")));
}
