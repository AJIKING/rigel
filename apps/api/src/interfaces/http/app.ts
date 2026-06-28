// ============================================================
// interfaces/http — Hono アプリ（ルーティング＝アプリ境界の入口）
// ------------------------------------------------------------
// HTTP の都合（ルート・ステータス・JSON 整形）だけを扱い、ドメイン処理は
// AppContainer 経由でユースケースに委譲する。Hono を使う。
// ============================================================

import { Hono } from "hono";
import type { AppContainer } from "../../composition-root";
import { buildContainer } from "../../composition-root";
import type { Env } from "../../env";
import { parseKifu } from "./validate";

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

  // 撮影画像 → 解析 → 保存。解析パイプライン（4分割＋正立・河/手牌読み取り・組み立て）は
  // 実装済み。HTTP 配線（multipart 受け取り）と認証(userId)は M8 → それまで 501。
  app.post("/analyze", (c) =>
    c.json(
      { ok: false, error: "analyze は HTTP配線＋認証(M8)待ち（解析パイプラインは実装済み）" },
      501,
    ),
  );

  return app;
}
