// interfaces/http — ルート実装の共有部品（型・ガード・整形）。
// 各 routes/*.ts と app.ts から使う。HTTP の都合だけを扱う。

import type { MiddlewareHandler } from "hono";
import type { AppContainer } from "../../composition-root";
import type { Env } from "../../env";
import type { User } from "../../domain/user/user";

export type AppEnv = {
  Bindings: Env;
  Variables: { container: AppContainer; userId?: string };
};

/** 認証必須ルートのガード。userId（認証ミドルウェアが載せる）が無ければ 401。 */
export const requireAuth: MiddlewareHandler<AppEnv> = async (c, next) => {
  if (!c.get("userId")) return c.json({ error: "unauthorized" }, 401);
  await next();
};

/** ユースケースの失敗理由を HTTP ステータスに対応づける（ルート間で統一）。 */
export function reasonStatus(reason: string): 400 | 402 | 403 | 404 | 409 {
  switch (reason) {
    case "quota_exceeded":
      return 402;
    case "private_limit":
    case "draft_limit":
      return 403;
    case "game_full":
      return 409;
    case "game_not_found":
    case "not_found":
      return 404;
    default:
      return 400;
  }
}

/** /auth/google と /me が共通で返すユーザープロフィール項目（JSON 整形）。
 *  email は運用専用のため絶対に含めない（外部に出さない）。 */
export function userProfileJson(user: User) {
  return {
    id: user.id,
    plan: user.plan,
    handle: user.handle,
    displayName: user.displayName,
  };
}
