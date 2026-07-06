// interfaces/http/routes — 半荘（Game）のルート。
// 一覧・公開フィード・詳細・作成（空の初局）・名称/公開範囲/ルール変更・削除。
// 公開/非公開・ルール・保存上限は半荘単位で扱う（局ごとに持たない）。

import { KifuSchema, RulesSchema, SeatSchema } from "@rigel/schema";
import type { Context, Hono } from "hono";
import { MAX_SEQ } from "../../../application/update-kifu.usecase";
import { reasonStatus, requireAuth, type AppEnv } from "../shared";

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

  // 公開牌譜フィード: 公開局を含む半荘を新着順に（全ユーザー・閲覧は自由）。
  app.get("/games/public", async (c) => {
    const cards = await c.get("container").listPublicGames.execute();
    return c.json(cards);
  });

  // 公開半荘の取得（読み取り専用ビューア用。公開局＋所有者表示。閲覧は自由）。
  app.get("/games/:id/public", async (c) => {
    const detail = await c.get("container").getPublicGameDetail.execute(c.req.param("id"));
    if (!detail) return c.json({ error: "not found" }, 404);
    return c.json(detail);
  });

  // 半荘名の変更。所有者のみ。body: { title }。
  app.patch("/games/:id", requireAuth, async (c) => {
    const body = await c.req.json<{ title?: unknown }>().catch(() => ({}) as { title?: unknown });
    if (typeof body.title !== "string") return c.json({ error: "title required" }, 400);
    const result = await c.get("container").updateGame.execute({
      userId: c.get("userId")!,
      gameId: c.req.param("id"),
      title: body.title,
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

  // 半荘の削除（配下の全局ごと）。所有者のみ。
  app.delete("/games/:id", requireAuth, async (c) => {
    const result = await c
      .get("container")
      .deleteGame.execute({ userId: c.get("userId")!, gameId: c.req.param("id") });
    if (!result.ok) return c.json({ error: "not found" }, 404);
    return c.json({ ok: true });
  });

  // 半荘詳細（半荘 + 局一覧）。所有者のみ。
  app.get("/games/:id", requireAuth, async (c) => {
    const detail = await c.get("container").getGameWithLogs.execute(c.req.param("id"));
    if (!detail || detail.game.userId !== c.get("userId"))
      return c.json({ error: "not found" }, 404);
    return c.json(detail);
  });

  // 新しい半荘を「空の初局」つきで作る（手動入力の起点）。
  app.post("/games", requireAuth, (c) => createEmptyKifuRoute(c));

  // 既存の半荘に空の局を追加（手動入力の起点。所有者のみ）。body: { cameraBottomSeat }。
  app.post("/games/:id/kifu", requireAuth, (c) => createEmptyKifuRoute(c, c.req.param("id")));
}
