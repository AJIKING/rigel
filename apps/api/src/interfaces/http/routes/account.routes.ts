// interfaces/http/routes — 認証・アカウント・プロフィールのルート。
// /auth/google・/auth/apple、/me 系、公開プロフィール。

import type { Context, Hono } from "hono";
import type { User } from "../../../domain/user/user";
import { monthlyCallQuota } from "../../../domain/user/user";
import { requireAuth, userProfileJson, withFavorites, type AppEnv } from "../shared";

/** /auth/apple/callback の転送先（mobile の lib/apple-login.ts の APPLE_REDIRECT_URL と一致必須。
 *  scheme は app.json の "scheme"）。 */
const APPLE_CALLBACK_APP_URL = "jp.co.plaria.rigel://apple-callback";

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
    // 無効な資格情報は日常的に起きるため warn。**エラーオブジェクトを丸ごと渡さない**
    // （jose の JWTExpired 等は own プロパティ payload にデコード済みクレーム＝email を持ち、
    // Observability のログに PII が残る。ルール7-2。2026-08-03 の監査指摘）。
    console.warn(
      `auth ${provider} verification failed`,
      e instanceof Error ? `${e.name}: ${e.message}` : "unknown error",
    );
    return c.json({ error: `invalid ${provider} credential` }, 401);
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

  // Android の Sign in with Apple（web フロー）の中継。Apple は redirect_uri に HTTPS しか
  // 許さず（カスタム scheme 不可）、scope 付きは response_mode=form_post 固定のため、
  // Apple からの form POST をここで受けてアプリのカスタム scheme へ 302 で返す。
  // トークンの検証はしない（従来どおり /auth/apple = ユースケースの責務）。state は
  // アプリが発行しアプリが照合する（この中継は透過。転送先は固定でオープンリダイレクト無し）。
  app.post("/auth/apple/callback", async (c) => {
    const form = await c.req.parseBody().catch(() => ({}) as Record<string, unknown>);
    const params = new URLSearchParams();
    for (const key of ["id_token", "code", "state", "error"]) {
      const value = form[key];
      if (typeof value === "string" && value) params.set(key, value);
    }
    if (!params.has("id_token") && !params.has("error")) params.set("error", "invalid_response");
    return c.redirect(`${APPLE_CALLBACK_APP_URL}?${params.toString()}`, 302);
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

  // ストア審査用の合言葉ログイン（docs/plans/review-login.md 案B）。固定の審査ユーザー
  // 1人に入る合鍵で、任意ユーザーへの口ではない。Secret 未設定なら 501 で閉じる。
  app.post("/auth/review", async (c) => {
    if (!c.get("container").reviewAuthEnabled) {
      return c.json({ error: "review auth not configured" }, 501);
    }
    const body = (await c.req.json().catch(() => null)) as { code?: unknown } | null;
    if (typeof body?.code !== "string") {
      return c.json({ error: "code required" }, 400);
    }
    const code = body.code;
    return respondAuth(c, "Review", () =>
      c.get("container").authenticateWithReviewCode.execute({ code }),
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

  // マイページ用: 自分の半荘＋局数/公開数/下書き数＋お気に入り数（人気順の並べ替えに使う）。
  app.get("/me/games", requireAuth, async (c) => {
    const cards = await c.get("container").listMyGamesWithCounts.execute(c.get("userId")!);
    return c.json(await withFavorites(c, "game", cards));
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
    // 一覧カードと同じく★（件数・自分が付けたか）を載せる。
    return c.json({ ...profile, games: await withFavorites(c, "game", profile.games) });
  });
}
