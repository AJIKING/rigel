// ============================================================
// interfaces/http — Hono アプリ（ルーティング＝アプリ境界の入口）
// ------------------------------------------------------------
// HTTP の都合（ルート・ステータス・JSON 整形）だけを扱い、ドメイン処理は
// AppContainer 経由でユースケースに委譲する。Hono を使う。
// ============================================================

import { CameraSeatSchema, SeatSchema } from "@rigel/schema";
import { Hono } from "hono";
import type { AppContainer } from "../../composition-root";
import { buildContainer } from "../../composition-root";
import type { Env } from "../../env";
import type { AnalysisInput, ImageRef } from "../../domain/kifu/analyzer";
import { parseKifu } from "./validate";

function asFile(value: unknown): File | null {
  return value instanceof File ? value : null;
}

async function toImageRef(file: File): Promise<ImageRef> {
  return { data: await file.arrayBuffer(), mimeType: file.type || "image/jpeg" };
}

type AppEnv = {
  Bindings: Env;
  Variables: { container: AppContainer; userId?: string };
};

export function createApp(): Hono<AppEnv> {
  const app = new Hono<AppEnv>();

  // リクエストごとに DI コンテナを組み立ててコンテキストに載せる。
  app.use("*", async (c, next) => {
    c.set("container", buildContainer(c.env));
    await next();
  });

  // 認証: Bearer セッショントークンがあれば検証して userId を載せる（無くても通す）。
  app.use("*", async (c, next) => {
    const auth = c.req.header("authorization");
    if (auth?.startsWith("Bearer ")) {
      const result = await c.get("container").session.verify(auth.slice("Bearer ".length));
      if (result) c.set("userId", result.userId);
    }
    await next();
  });

  app.get("/health", (c) => c.json({ ok: true }));

  // Google ID トークンでログイン → 自前セッショントークンを発行。
  app.post("/auth/google", async (c) => {
    const body = (await c.req.json().catch(() => null)) as { idToken?: unknown } | null;
    if (typeof body?.idToken !== "string") {
      return c.json({ error: "idToken required" }, 400);
    }
    try {
      const { sessionToken, user, created } = await c
        .get("container")
        .authenticateWithGoogle.execute({ idToken: body.idToken });
      return c.json(
        { sessionToken, created, user: { id: user.id, plan: user.plan } },
        created ? 201 : 200,
      );
    } catch {
      return c.json({ error: "invalid Google token" }, 401);
    }
  });

  // ログインユーザーの半荘一覧。
  app.get("/games", async (c) => {
    const userId = c.get("userId");
    if (!userId) return c.json({ error: "unauthorized" }, 401);
    const games = await c.get("container").listGames.execute(userId);
    return c.json(games);
  });

  // 半荘詳細（半荘 + 局一覧）。所有者のみ。
  app.get("/games/:id", async (c) => {
    const userId = c.get("userId");
    if (!userId) return c.json({ error: "unauthorized" }, 401);
    const detail = await c.get("container").getGameWithLogs.execute(c.req.param("id"));
    if (!detail || detail.game.userId !== userId) return c.json({ error: "not found" }, 404);
    return c.json(detail);
  });

  // 認証済みユーザー自身。
  app.get("/me", async (c) => {
    const userId = c.get("userId");
    if (!userId) return c.json({ error: "unauthorized" }, 401);
    const user = await c.get("container").getUser.execute(userId);
    if (!user) return c.json({ error: "not found" }, 404);
    return c.json({
      id: user.id,
      plan: user.plan,
      analysisCountThisMonth: user.analysisCountThisMonth,
    });
  });

  // 牌譜JSONの検証のみ（保存はしない）。背骨スキーマで弾く。
  app.post("/kifu/validate", async (c) => {
    const body: unknown = await c.req.json().catch(() => null);
    const parsed = parseKifu(body);
    if (!parsed.ok) return c.json({ ok: false, errors: parsed.errors }, 400);
    return c.json({ ok: true });
  });

  // 牌譜1件の取得（閲覧は無料）。
  app.get("/kifu/:id", async (c) => {
    const log = await c.get("container").getKifu.execute(c.req.param("id"));
    if (!log) return c.json({ error: "not found" }, 404);
    return c.json(log);
  });

  // ユーザーの牌譜一覧（閲覧は無料）。
  app.get("/users/:id/kifu", async (c) => {
    const logs = await c.get("container").listKifu.execute(c.req.param("id"));
    return c.json(logs);
  });

  // 撮影画像 → 解析 → 半荘に局として保存（multipart）。
  // フォーム: river(file), cameraBottomSeat(east|south|west|north),
  //          hand_bottom/right/top/left(file 任意), gameId(任意=既存半荘へ追加)。
  app.post("/analyze", async (c) => {
    const userId = c.get("userId");
    if (!userId) return c.json({ error: "unauthorized" }, 401);

    const form = await c.req.formData().catch(() => null);
    const river = asFile(form?.get("river"));
    const seat = SeatSchema.safeParse(form?.get("cameraBottomSeat"));
    if (!river || !seat.success) {
      return c.json(
        { error: "river(file) と cameraBottomSeat(east/south/west/north) が必要です" },
        400,
      );
    }

    const hands: Partial<Record<(typeof CameraSeatSchema.options)[number], ImageRef>> = {};
    for (const cam of CameraSeatSchema.options) {
      const f = asFile(form?.get(`hand_${cam}`));
      if (f) hands[cam] = await toImageRef(f);
    }

    const input: AnalysisInput = {
      riverImage: await toImageRef(river),
      hands,
      cameraBottomSeat: seat.data,
    };
    const gameIdRaw = form?.get("gameId");
    const gameId = typeof gameIdRaw === "string" && gameIdRaw ? gameIdRaw : undefined;

    try {
      const result = await c.get("container").analyzeAndSaveKifu.execute({ userId, input, gameId });
      if (!result.ok) {
        const status =
          result.reason === "quota_exceeded" ? 402 : result.reason === "game_not_found" ? 404 : 400;
        return c.json({ ok: false, reason: result.reason }, status);
      }
      return c.json({ ok: true, gameId: result.gameId, logId: result.gameLog.id }, 201);
    } catch {
      return c.json({ ok: false, error: "解析に失敗しました" }, 502);
    }
  });

  return app;
}
