// interfaces/http/routes — 課金のルート。
// Stripe（web: Checkout / Portal / Webhook）と RevenueCat Webhook（エンタイトルメントの
// 真実源。アプリの IAP は RevenueCat SDK → RevenueCat → この Webhook で届く）。
// 未設定の環境では 501 を返す（billingEnabled / revenueCatEnabled）。

import type { Hono } from "hono";
import { isAllowedRedirect } from "../redirect";
import { requireAuth, timingSafeEqual, type AppEnv } from "../shared";

export function registerBillingRoutes(app: Hono<AppEnv>): void {
  // 課金: サブスク用 Checkout を開始（要認証）。body: { plan: "next"|"pro", successUrl, cancelUrl }。
  app.post("/billing/checkout", requireAuth, async (c) => {
    const container = c.get("container");
    if (!container.billingEnabled) return c.json({ error: "billing not configured" }, 501);
    const body = (await c.req.json().catch(() => null)) as {
      plan?: unknown;
      successUrl?: unknown;
      cancelUrl?: unknown;
    } | null;
    if (body?.plan !== "next" && body?.plan !== "pro") {
      return c.json({ error: "plan は next か pro" }, 400);
    }
    if (typeof body.successUrl !== "string" || typeof body.cancelUrl !== "string") {
      return c.json({ error: "successUrl と cancelUrl が必要です" }, 400);
    }
    // 戻り先は自分のオリジン（＋アプリのスキーム）に限定する（オープンリダイレクト対策）。
    const origins = c.env.ALLOWED_ORIGINS;
    if (
      !isAllowedRedirect(body.successUrl, origins) ||
      !isAllowedRedirect(body.cancelUrl, origins)
    ) {
      return c.json({ error: "戻り先URLが許可されていません" }, 400);
    }
    try {
      const result = await container.startCheckout.execute({
        userId: c.get("userId")!,
        plan: body.plan,
        successUrl: body.successUrl,
        cancelUrl: body.cancelUrl,
      });
      // 加入中の作り直しは二重サブスク＝二重課金になるため 409（ポータルで変更する）。
      if (!result.ok) return c.json({ error: "already subscribed" }, 409);
      return c.json({ url: result.url });
    } catch (e) {
      // Workers Logs（observability 有効）へ残す。無ログだと課金導線の障害を追えない。
      console.error("POST /billing/checkout failed", e);
      return c.json({ error: "checkout の作成に失敗しました" }, 502);
    }
  });

  // 課金: 決済ポータル（プラン変更・解約・支払い方法）。加入中ユーザーのみ（未加入は 404）。
  app.post("/billing/portal", requireAuth, async (c) => {
    const container = c.get("container");
    if (!container.billingEnabled) return c.json({ error: "billing not configured" }, 501);
    const body = (await c.req.json().catch(() => null)) as { returnUrl?: unknown } | null;
    if (typeof body?.returnUrl !== "string") {
      return c.json({ error: "returnUrl が必要です" }, 400);
    }
    if (!isAllowedRedirect(body.returnUrl, c.env.ALLOWED_ORIGINS)) {
      return c.json({ error: "戻り先URLが許可されていません" }, 400);
    }
    try {
      const result = await container.openBillingPortal.execute({
        userId: c.get("userId")!,
        returnUrl: body.returnUrl,
      });
      if (!result.ok) return c.json({ error: "not subscribed" }, 404);
      return c.json({ url: result.url });
    } catch (e) {
      console.error("POST /billing/portal failed", e);
      return c.json({ error: "portal の作成に失敗しました" }, 502);
    }
  });

  // 課金: RevenueCat Webhook（エンタイトルメントの真実源。web=Stripe/アプリ=IAP を横串で
  // 一元管理し、これだけが users.plan を書く）。認証は Authorization 共有シークレット照合。
  app.post("/billing/revenuecat/webhook", async (c) => {
    const container = c.get("container");
    if (!container.revenueCatEnabled) return c.json({ error: "revenuecat not configured" }, 501);
    // 共有シークレットの照合は定数時間比較（総当たりのタイミング手掛かりを与えない）。
    if (!timingSafeEqual(c.req.header("authorization"), container.revenueCatWebhookAuth)) {
      return c.json({ error: "unauthorized" }, 401);
    }
    const body = await c.req.json().catch(() => null);
    try {
      const result = await container.handleRevenueCatWebhook.execute({ body });
      return c.json({ received: true, handled: result.handled });
    } catch (e) {
      // plan を書く唯一の経路。原因（署名不正か DB 障害か）を追えるよう必ずログする。
      console.error("POST /billing/revenuecat/webhook failed", e);
      return c.json({ error: "invalid webhook" }, 400);
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
    } catch (e) {
      // plan を書く唯一の経路。原因（署名不正か DB 障害か）を追えるよう必ずログする。
      console.error("POST /billing/webhook failed", e);
      return c.json({ error: "invalid webhook" }, 400);
    }
  });
}
