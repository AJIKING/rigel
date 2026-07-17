// Worker のバインディング/環境変数。wrangler.toml と対応させる。
// 秘匿値は .dev.vars / Secrets で渡す（コミットしない）。

import type { RateLimiter } from "./interfaces/http/rate-limit";
export interface Env {
  /** D1 データベース（wrangler.toml の binding = "DB"）。 */
  DB: D1Database;
  /** レート制限（Cloudflare Rate Limiting binding）。未設定なら制限しない＝ローカル開発。
   *  読み取り=IP / 書き込み=userId / 解析=userId（厳しめ）。rate-limit.ts を参照。 */
  RL_READ?: RateLimiter;
  RL_WRITE?: RateLimiter;
  RL_ANALYZE?: RateLimiter;
  /** Gemini API キー（Secret）。 */
  GEMINI_API_KEY: string;
  /** Cloudflare AI Gateway の google-ai-studio ベースURL（`/v1beta/...` の手前まで）。 */
  CLOUDFLARE_AI_GATEWAY_URL: string;
  /** 河読み取りモデル名（任意。未指定なら既定値）。ハードコードせず AI Studio の現行モデルを設定。 */
  GEMINI_RIVER_MODEL?: string;
  /** 手牌読み取りモデル名（任意。未指定なら既定値。素直なタスクなので Flash-Lite 系）。 */
  GEMINI_HAND_MODEL?: string;
  /** Google OAuth クライアントID（ID トークンの aud 検証に使う）。
   *  web/iOS/Android で別クライアントIDを使うため、カンマ区切りで複数指定可。 */
  GOOGLE_CLIENT_ID: string;
  /** Sign in with Apple の許可 aud（アプリ=Bundle ID / web=Services ID。カンマ区切りで複数可）。
   *  未設定なら /auth/apple は 501（App Store 提出前に設定必須＝審査要件 4.8）。 */
  APPLE_CLIENT_ID?: string;
  /** Apple Developer の Team ID（退会時のトークン失効=revoke 用。未設定なら失効をスキップ）。 */
  APPLE_TEAM_ID?: string;
  /** Sign in with Apple キーの Key ID（revoke 用）。 */
  APPLE_KEY_ID?: string;
  /** Sign in with Apple キー .p8 の中身（Secret。revoke 用）。 */
  APPLE_PRIVATE_KEY?: string;
  /** CORS 許可オリジン（カンマ区切り。例: "https://rigel.plaria.co.jp"）。
   *  localhost 開発オリジンは既定で常に許可するので本番ドメインだけ列挙すればよい。 */
  ALLOWED_ORIGINS?: string;
  /** セッショントークンの署名鍵（Secret）。 */
  SESSION_SECRET: string;
  /** Stripe シークレットキー（Secret。未設定なら課金機能は無効）。 */
  STRIPE_SECRET_KEY?: string;
  /** Stripe Webhook 署名シークレット（Secret）。 */
  STRIPE_WEBHOOK_SECRET?: string;
  /** RIGEL Next の価格ID（price_...）。 */
  STRIPE_PRICE_NEXT?: string;
  /** RIGEL Pro の価格ID（price_...）。 */
  STRIPE_PRICE_PRO?: string;
  /** RevenueCat Webhook の Authorization ヘッダ照合値（Secret。ダッシュボードの
   *  Webhooks 設定と同じ文字列。未設定なら受け口は 501）。 */
  REVENUECAT_WEBHOOK_AUTH?: string;
  /** "true" なら SANDBOX 環境のイベントも plan に適用する（開発用。本番は未設定）。 */
  REVENUECAT_ALLOW_SANDBOX?: string;
  /** RevenueCat の Stripe アプリの Public API key（strp_...。環境ごとに別値。
   *  未設定なら Checkout 完了時の RevenueCat 登録をスキップ）。 */
  REVENUECAT_STRIPE_PUBLIC_KEY?: string;
}
