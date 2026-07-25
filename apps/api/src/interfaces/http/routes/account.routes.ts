// interfaces/http/routes — 認証・アカウント・プロフィールのルート。
// /auth/google・/auth/apple、/me 系、公開プロフィール。

import type { Context, Hono } from "hono";
import type { User } from "../../../domain/user/user";
import { monthlyCallQuota } from "../../../domain/user/user";
import { requireAuth, userProfileJson, type AppEnv } from "../shared";

/** /auth/xxx 共通のレスポンス整形。成功=200/201（/me と同じプロフィール項目を同梱し、
 *  ログイン直後の設定画面が /me 再取得なしで handle/表示名を出せるように）。
 *  検証失敗は 401（プロバイダ名以外の詳細は返さない）。 */
async function respondAuth(
  c: Context<AppEnv>,
  provider: string,
  run: () => Promise<{ sessionToken: string; user: User; created: boolean }>,
) {
  try {
    const { sessionToken, user, created } = await run();
    return c.json({ sessionToken, created, user: userProfileJson(user) }, created ? 201 : 200);
  } catch (e) {
    // 無効トークンは日常的に起きるため warn（トークン本体は含めない）。
    console.warn(`auth ${provider} token verification failed`, e);
    return c.json({ error: `invalid ${provider} token` }, 401);
  }
}

export function registerAccountRoutes(app: Hono<AppEnv>): void {
  // Google ID トークンでログイン → 自前セッショントークンを発行。
  app.post("/auth/google", async (c) => {
    const body = (await c.req.json().catch(() => null)) as { idToken?: unknown } | null;
    if (typeof body?.idToken !== "string") {
      return c.json({ error: "idToken required" }, 400);
    }
    const idToken = body.idToken;
    return respondAuth(c, "Google", () =>
      c.get("container").authenticateWithGoogle.execute({ idToken }),
    );
  });

  // Apple ID トークンでログイン（App Store 審査要件 4.8。/auth/google と対称）。
  // authorizationCode は退会時のトークン失効（revoke）用の refresh token 交換に使う（任意）。
  app.post("/auth/apple", async (c) => {
    if (!c.get("container").appleAuthEnabled) {
      return c.json({ error: "apple auth not configured" }, 501);
    }
    const body = (await c.req.json().catch(() => null)) as {
      idToken?: unknown;
      authorizationCode?: unknown;
    } | null;
    if (typeof body?.idToken !== "string") {
      return c.json({ error: "idToken required" }, 400);
    }
    const idToken = body.idToken;
    const authorizationCode =
      typeof body.authorizationCode === "string" ? body.authorizationCode : undefined;
    return respondAuth(c, "Apple", () =>
      c.get("container").authenticateWithApple.execute({ idToken, authorizationCode }),
    );
  });

  // 認証済みユーザー自身（プランと当月の利用量・上限）。
  app.get("/me", requireAuth, async (c) => {
    const user = await c.get("container").getUser.execute(c.get("userId")!);
    if (!user) return c.json({ error: "not found" }, 404);
    return c.json({
      ...userProfileJson(user),
      analysisCountThisMonth: user.analysisCountThisMonth,
      monthlyCallQuota: monthlyCallQuota(user.plan),
      remainingCalls: user.remainingCalls(new Date()),
    });
  });

  // マイページ用: 自分の半荘＋局数/公開数/下書き数。
  app.get("/me/games", requireAuth, async (c) => {
    const cards = await c.get("container").listMyGamesWithCounts.execute(c.get("userId")!);
    return c.json(cards);
  });

  // プロフィール更新（ハンドル/表示名）。プロフィールは常に公開（非公開機能は無し）。
  app.put("/me/profile", requireAuth, async (c) => {
    const body = (await c.req.json().catch(() => null)) as {
      handle?: unknown;
      displayName?: unknown;
    } | null;
    const result = await c.get("container").updateProfile.execute({
      userId: c.get("userId")!,
      handle: typeof body?.handle === "string" ? body.handle : undefined,
      displayName: typeof body?.displayName === "string" ? body.displayName : undefined,
    });
    if (!result.ok) {
      const status =
        result.reason === "handle_taken" ? 409 : result.reason === "not_found" ? 404 : 400;
      return c.json({ ok: false, reason: result.reason }, status);
    }
    return c.json({ ok: true });
  });

  // アカウント削除（自分の牌譜・半荘・ユーザーをカスケード削除）。
  // 有料プラン契約中は不可（先に解約して free に戻す必要がある）。
  app.delete("/me", requireAuth, async (c) => {
    const result = await c.get("container").deleteAccount.execute(c.get("userId")!);
    if (!result.ok) {
      return c.json({ error: result.reason }, result.reason === "paid_plan" ? 403 : 404);
    }
    return c.json({ ok: true });
  });

  // 別ユーザーの公開プロフィール＋公開半荘（handle か id）。閲覧自由。
  app.get("/users/:idOrHandle/profile", async (c) => {
    const profile = await c.get("container").getPublicProfile.execute(c.req.param("idOrHandle"));
    if (!profile) return c.json({ error: "not found" }, 404);
    return c.json(profile);
  });
}
