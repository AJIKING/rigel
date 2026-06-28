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
  Variables: { container: AppContainer };
};

export function createApp(): Hono<AppEnv> {
  const app = new Hono<AppEnv>();

  // リクエストごとに DI コンテナを組み立ててコンテキストに載せる。
  app.use("*", async (c, next) => {
    c.set("container", buildContainer(c.env));
    await next();
  });

  app.get("/health", (c) => c.json({ ok: true }));

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

  // 撮影画像 → 解析 → 保存。河の読み取り(Gemini)・組み立ては実装済みだが、
  // 河の4分割＋正立(image processing)が未実装(M5b)のため、まだ通しでは動かせない → 501。
  app.post("/analyze", (c) =>
    c.json(
      { ok: false, error: "analyze は準備中（河の4分割＋正立が未実装。読み取り自体は実装済み）" },
      501,
    ),
  );

  return app;
}
