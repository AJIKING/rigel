// ============================================================
// interfaces/http — Hono アプリ（ルーティング＝アプリ境界の入口）
// ------------------------------------------------------------
// HTTP の都合（ルート・ステータス・JSON 整形）だけを扱い、ドメイン処理は
// AppContainer 経由でユースケースに委譲する。Hono を使う。
// ============================================================

import { CameraSeatSchema, SeatSchema } from "@rigel/schema";
import { Hono, type MiddlewareHandler } from "hono";
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

/** 認証必須ルートのガード。userId（認証ミドルウェアが載せる）が無ければ 401。 */
const requireAuth: MiddlewareHandler<AppEnv> = async (c, next) => {
  if (!c.get("userId")) return c.json({ error: "unauthorized" }, 401);
  await next();
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
  app.get("/games", requireAuth, async (c) => {
    const games = await c.get("container").listGames.execute(c.get("userId")!);
    return c.json(games);
  });

  // 半荘詳細（半荘 + 局一覧）。所有者のみ。
  app.get("/games/:id", requireAuth, async (c) => {
    const detail = await c.get("container").getGameWithLogs.execute(c.req.param("id"));
    if (!detail || detail.game.userId !== c.get("userId"))
      return c.json({ error: "not found" }, 404);
    return c.json(detail);
  });

  // 認証済みユーザー自身。
  app.get("/me", requireAuth, async (c) => {
    const user = await c.get("container").getUser.execute(c.get("userId")!);
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

  // 牌譜の修正を保存（所有者のみ）。body は Kifu JSON。
  app.put("/kifu/:id", requireAuth, async (c) => {
    const parsed = parseKifu(await c.req.json().catch(() => null));
    if (!parsed.ok) return c.json({ ok: false, errors: parsed.errors }, 400);
    const result = await c.get("container").updateKifu.execute({
      userId: c.get("userId")!,
      logId: c.req.param("id"),
      kifu: parsed.kifu,
    });
    if (!result.ok) return c.json({ error: "not found" }, 404);
    return c.json({ ok: true });
  });

  // 課金: サブスク用 Checkout を開始（要認証）。body: { successUrl, cancelUrl }。
  app.post("/billing/checkout", requireAuth, async (c) => {
    const container = c.get("container");
    if (!container.billingEnabled) return c.json({ error: "billing not configured" }, 501);
    const body = (await c.req.json().catch(() => null)) as {
      successUrl?: unknown;
      cancelUrl?: unknown;
    } | null;
    if (typeof body?.successUrl !== "string" || typeof body?.cancelUrl !== "string") {
      return c.json({ error: "successUrl と cancelUrl が必要です" }, 400);
    }
    try {
      const { url } = await container.startCheckout.execute({
        userId: c.get("userId")!,
        successUrl: body.successUrl,
        cancelUrl: body.cancelUrl,
      });
      return c.json({ url });
    } catch {
      return c.json({ error: "checkout の作成に失敗しました" }, 502);
    }
  });

  // 課金: Stripe Webhook（署名検証。認証は通さない＝Stripe から直接呼ばれる）。
  app.post("/billing/webhook", async (c) => {
    const container = c.get("container");
    if (!container.billingEnabled) return c.json({ error: "billing not configured" }, 501);
    const signature = c.req.header("stripe-signature");
    if (!signature) return c.json({ error: "missing signature" }, 400);
    const payload = await c.req.text(); // 署名検証には生ボディが要る。
    try {
      const result = await container.handleBillingWebhook.execute({ payload, signature });
      return c.json({ received: true, handled: result.handled });
    } catch {
      return c.json({ error: "invalid webhook" }, 400);
    }
  });

  // ユーザーの牌譜一覧（閲覧は無料）。
  app.get("/users/:id/kifu", async (c) => {
    const logs = await c.get("container").listKifu.execute(c.req.param("id"));
    return c.json(logs);
  });

  // 撮影画像 → 解析 → 半荘に局として保存（multipart）。
  // フォーム: river(file), cameraBottomSeat(east|south|west|north),
  //          hand_bottom/right/top/left(file 任意), gameId(任意=既存半荘へ追加)。
  app.post("/analyze", requireAuth, async (c) => {
    const userId = c.get("userId")!;

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
