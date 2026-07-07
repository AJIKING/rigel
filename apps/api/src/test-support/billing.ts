// ============================================================
// test-support — 課金（Stripe / App Store IAP）テストの共有部品
// ------------------------------------------------------------
// マネタイズの中核なので、HTTP 統合（ルート→ユースケース→リポジトリ）を
// 実物のユースケースと in-memory リポジトリで通せるコンテナを提供する。
// gateway / verifier は呼び出し側が実物（実署名検証）とフェイクを選ぶ。
// ============================================================

import type {
  AppStoreConfig,
  AppStoreNotification,
  AppStoreTransaction,
  AppStoreVerifier,
} from "../domain/billing/appstore";
import type {
  BillingEvent,
  BillingGateway,
  CheckoutParams,
} from "../domain/billing/billing-gateway";
import { User } from "../domain/user/user";
import { HandleAppStoreNotification } from "../application/handle-appstore-notification.usecase";
import { HandleBillingWebhook } from "../application/handle-billing-webhook.usecase";
import { OpenBillingPortal } from "../application/open-billing-portal.usecase";
import { RedeemAppStorePurchase } from "../application/redeem-appstore-purchase.usecase";
import { StartCheckout } from "../application/start-checkout.usecase";
import type { AppContainer } from "../composition-root";
import type { Env } from "../env";
import { JwtSessionService } from "../infrastructure/auth/jwt-session-service";
import { InMemoryUserRepository } from "./in-memory";

export const TEST_SESSION_SECRET = "test-secret";

/** mobile の IAP_PRODUCT_IDS / wrangler.toml と同じ体系のテスト設定。 */
export const APPSTORE_TEST_CONFIG: AppStoreConfig = {
  bundleId: "jp.co.plaria.rigel",
  productNext: "rigel.next.monthly",
  productPro: "rigel.pro.monthly",
};

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

/** verifyTransaction / parseNotification が固定値（または例外）のフェイク。 */
export class FakeAppStoreVerifier implements AppStoreVerifier {
  constructor(
    private readonly transaction: AppStoreTransaction | Error,
    private readonly notification: AppStoreNotification = { type: "ignored" },
  ) {}
  verifyTransaction(): Promise<AppStoreTransaction> {
    if (this.transaction instanceof Error) return Promise.reject(this.transaction);
    return Promise.resolve(this.transaction);
  }
  parseNotification(): Promise<AppStoreNotification> {
    return Promise.resolve(this.notification);
  }
}

export interface BillingContainerOptions {
  users: InMemoryUserRepository;
  gateway: BillingGateway;
  verifier: AppStoreVerifier;
  config?: AppStoreConfig;
  now?: () => Date;
}

/**
 * 課金ルート専用の DI コンテナ（createApp の container オプションに渡す）。
 * ユースケースは実物・リポジトリは in-memory。課金以外のルートは呼ばれない前提
 * のため未定義（呼ぶと落ちる＝テストの誤用がすぐ分かる）。
 */
export function billingTestContainer(opts: BillingContainerOptions): (env: Env) => AppContainer {
  const config = opts.config ?? APPSTORE_TEST_CONFIG;
  const now = opts.now ?? (() => new Date());
  const container = {
    billingEnabled: true,
    iapEnabled: true,
    session: new JwtSessionService({ secret: TEST_SESSION_SECRET }),
    startCheckout: new StartCheckout(opts.gateway, opts.users),
    openBillingPortal: new OpenBillingPortal(opts.gateway),
    handleBillingWebhook: new HandleBillingWebhook(opts.gateway, opts.users),
    redeemAppStorePurchase: new RedeemAppStorePurchase({
      verifier: opts.verifier,
      users: opts.users,
      config,
      now,
    }),
    handleAppStoreNotification: new HandleAppStoreNotification({
      verifier: opts.verifier,
      users: opts.users,
      config,
    }),
  } as Partial<AppContainer> as AppContainer;
  return () => container;
}

/** 認証済みリクエスト用のセッショントークンを発行する。 */
export function issueTestToken(userId: string): Promise<string> {
  return new JwtSessionService({ secret: TEST_SESSION_SECRET }).issue(userId);
}
