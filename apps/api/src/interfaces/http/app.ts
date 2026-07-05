// ============================================================
// interfaces/http — Hono アプリ（ルーティング＝アプリ境界の入口）
// ------------------------------------------------------------
// ここは横断ミドルウェア（CORS / DI / 認証）だけを持ち、個々のルートは
// routes/ にドメイン単位で分割する（account / games / kifu / billing）。
// HTTP の都合（ルート・ステータス・JSON 整形）だけを扱い、ドメイン処理は
// AppContainer 経由でユースケースに委譲する。
// ============================================================

import { Hono } from "hono";
import { cors } from "hono/cors";
import { buildContainer } from "../../composition-root";
import { registerAccountRoutes } from "./routes/account.routes";
import { registerBillingRoutes } from "./routes/billing.routes";
import { registerGameRoutes } from "./routes/games.routes";
import { registerKifuRoutes } from "./routes/kifu.routes";
import type { AppEnv } from "./shared";

/** localhost 開発オリジンは常に許可する（本番ドメインは ALLOWED_ORIGINS で渡す）。 */
const DEV_ORIGINS = ["http://localhost:3000"];

export function createApp(): Hono<AppEnv> {
  const app = new Hono<AppEnv>();

  // CORS。web は別オリジン（rigel.plaria.co.jp）から API を叩くため、
  // 許可オリジンのプリフライト/レスポンスに ACAO を返す。認証は Bearer
  // トークン方式（Cookie 不使用）なので credentials は不要。最初に置いて
  // OPTIONS プリフライトを DB 無しで処理する。
  app.use("*", (c, next) =>
    cors({
      origin: (origin) => {
        const allow = [
          ...(c.env.ALLOWED_ORIGINS ?? "")
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean),
          ...DEV_ORIGINS,
        ];
        return allow.includes(origin) ? origin : null;
      },
      allowHeaders: ["Content-Type", "Authorization"],
      allowMethods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
      maxAge: 86400,
    })(c, next),
  );

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

  registerAccountRoutes(app);
  registerGameRoutes(app);
  registerKifuRoutes(app);
  registerBillingRoutes(app);

  return app;
}
