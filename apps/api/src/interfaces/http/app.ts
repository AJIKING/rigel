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
import { bodyLimit } from "hono/body-limit";
import { buildContainer, type AppContainer } from "../../composition-root";
import { BODY_LIMIT_BYTES } from "./limits";
import { rateLimit } from "./rate-limit";
import type { Env } from "../../env";
import { registerAccountRoutes } from "./routes/account.routes";
import { registerBillingRoutes } from "./routes/billing.routes";
import { registerFavoriteRoutes } from "./routes/favorites.routes";
import { registerGameRoutes } from "./routes/games.routes";
import { registerKifuRoutes } from "./routes/kifu.routes";
import { registerProblemRoutes } from "./routes/problems.routes";
import { registerQuizRoutes } from "./routes/quiz.routes";
import type { AppEnv } from "./shared";

/** localhost 開発オリジンは常に許可する（本番ドメインは ALLOWED_ORIGINS で渡す）。 */
const DEV_ORIGINS = ["http://localhost:3000"];

export interface CreateAppOptions {
  /**
   * DI コンテナの組み立てを差し替える（統合テスト用の継ぎ目）。
   * 省略時は本番の buildContainer(env)。ルート・ミドルウェアの挙動は変わらない。
   */
  container?: (env: Env) => AppContainer;
}

export function createApp(options: CreateAppOptions = {}): Hono<AppEnv> {
  const app = new Hono<AppEnv>();
  const makeContainer = options.container ?? buildContainer;

  // CORS。web は別オリジン（raisha.jp）から API を叩くため、
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

  // JSON ボディの上限（413）。/analyze（multipart）は画像ごとの上限を各ルートで見るため除外する。
  // Workers 既定（~100MB）任せだと、認証済みユーザーが D1 の行や CPU を安価に焼ける。
  app.use("*", async (c, next) => {
    if (c.req.path === "/analyze") return next();
    return bodyLimit({
      maxSize: BODY_LIMIT_BYTES,
      onError: (ctx) => ctx.json({ error: "payload too large" }, 413),
    })(c, next);
  });

  // リクエストごとに DI コンテナを組み立ててコンテキストに載せる。
  app.use("*", async (c, next) => {
    c.set("container", makeContainer(c.env));
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

  // レート制限（乱用・DoS）。userId が解決済みの位置に置き、ルート・DB より前で弾く。
  app.use("*", rateLimit);

  // 補足（削除済みユーザーのトークン）: ステートレス JWT は失効リストを持たないため、
  // アカウント削除後もトークンは exp（最大30日）まで署名検証を通る。ただし D1 は外部キーを
  // 強制するので（game_logs/games/problems はすべて users.id を参照）、存在しない userId で
  // 行を作ることはできず、孤児データは生まれない。読み書きの各ユースケースも所有者チェックで
  // not_found に落ちる。よって全書き込みに存在確認クエリを1本足す（＝コスト増）ことはしない。

  app.get("/health", (c) => c.json({ ok: true }));

  registerAccountRoutes(app);
  registerGameRoutes(app);
  registerKifuRoutes(app);
  registerProblemRoutes(app);
  registerQuizRoutes(app);
  registerFavoriteRoutes(app);
  registerBillingRoutes(app);

  return app;
}
