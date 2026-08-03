// ============================================================
// test-support — 課金（Stripe / RevenueCat）テストの共有部品
// ------------------------------------------------------------
// マネタイズの中核なので、HTTP 統合（ルート→ユースケース→リポジトリ）を
// 実物のユースケースと in-memory リポジトリで通せるコンテナを提供する。
// gateway は呼び出し側が実物（実署名検証）とフェイクを選ぶ。
// ============================================================

import type {
  BillingEvent,
  BillingGateway,
  CheckoutParams,
} from "../domain/billing/billing-gateway";
import { User } from "../domain/user/user";
import { GetUser } from "../application/get-user.usecase";
import { HandleBillingWebhook } from "../application/handle-billing-webhook.usecase";
import { HandleRevenueCatWebhook } from "../application/handle-revenuecat-webhook.usecase";
import { OpenBillingPortal } from "../application/open-billing-portal.usecase";
import { StartCheckout } from "../application/start-checkout.usecase";
import type { AppContainer } from "../composition-root";
import type { Env } from "../env";
import { JwtSessionService } from "../infrastructure/auth/jwt-session-service";
import { InMemoryRevenueCatEventRepository, InMemoryUserRepository } from "./in-memory";

export const TEST_SESSION_SECRET = "test-secret";

/** HTTP テスト共通の Env（DB を使わないルート/コンテナ注入前提。DB はダミー）。 */
export const fakeEnv = {
  DB: {} as unknown as D1Database,
  // 非同期解析の一時画像/キュー（ルート契約テストでは触られない。触るテストは
  // in-memory-analysis のフェイクを container 側に差す）。
  PHOTOS: {} as unknown as R2Bucket,
  ANALYSIS_QUEUE: { send: () => Promise.resolve() } as unknown as Env["ANALYSIS_QUEUE"],
  GEMINI_API_KEY: "",
  CLOUDFLARE_AI_GATEWAY_URL: "",
  GOOGLE_CLIENT_ID: "test-client-id",
  // 決済の戻り先検証（isAllowedRedirect）で使う許可オリジン。テストは https://app を自オリジンとする。
  ALLOWED_ORIGINS: "https://app",
  SESSION_SECRET: TEST_SESSION_SECRET,
} satisfies Env;

/** RevenueCat Webhook の Authorization 照合値（テスト用）。 */
export const REVENUECAT_TEST_AUTH = "Bearer test-rc-secret";

export function makeFreeUser(id: string): User {
  return new User({
    id,
    googleSub: `sub-${id}`,
    plan: "free",
    analysisCountThisMonth: 0,
    countResetAt: new Date("2026-08-01T00:00:00.000Z"),
  });
}

/** parseEvent が固定イベントを返すフェイク。createCheckoutSession は引数を記録する。 */
export class FakeBillingGateway implements BillingGateway {
  lastCheckout?: CheckoutParams;
  constructor(
    private readonly event: BillingEvent = { type: "ignored" },
    private readonly portalUrl: string | null = null,
  ) {}
  createCheckoutSession(params: CheckoutParams): Promise<{ url: string }> {
    this.lastCheckout = params;
    return Promise.resolve({ url: `https://stripe.test/pay/${params.userId}` });
  }
  parseEvent(): Promise<BillingEvent> {
    return Promise.resolve(this.event);
  }
  createPortalSession(): Promise<{ url: string } | null> {
    return Promise.resolve(this.portalUrl ? { url: this.portalUrl } : null);
  }
}

export interface BillingContainerOptions {
  users: InMemoryUserRepository;
  /** 省略時はフェイク（checkout/portal を呼ばないテスト用）。 */
  gateway?: BillingGateway;
}

/**
 * 課金ルート専用の DI コンテナ（createApp の container オプションに渡す）。
 * ユースケースは実物・リポジトリは in-memory。課金以外のルートは呼ばれない前提
 * のため未定義（呼ぶと落ちる＝テストの誤用がすぐ分かる）。
 */
export function billingTestContainer(opts: BillingContainerOptions): (env: Env) => AppContainer {
  const gateway = opts.gateway ?? new FakeBillingGateway();
  const container = {
    billingEnabled: true,
    session: new JwtSessionService({ secret: TEST_SESSION_SECRET }),
    getUser: new GetUser(opts.users),
    startCheckout: new StartCheckout(gateway, opts.users),
    openBillingPortal: new OpenBillingPortal(gateway),
    handleBillingWebhook: new HandleBillingWebhook(gateway, opts.users),
    revenueCatEnabled: true,
    revenueCatWebhookAuth: REVENUECAT_TEST_AUTH,
    handleRevenueCatWebhook: new HandleRevenueCatWebhook({
      users: opts.users,
      events: new InMemoryRevenueCatEventRepository(),
      allowSandbox: false,
    }),
  } as Partial<AppContainer> as AppContainer;
  return () => container;
}

/** 認証済みリクエスト用のセッショントークンを発行する。 */
export function issueTestToken(userId: string): Promise<string> {
  return new JwtSessionService({ secret: TEST_SESSION_SECRET }).issue(userId);
}
