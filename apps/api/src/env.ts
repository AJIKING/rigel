// Worker のバインディング/環境変数。wrangler.toml と対応させる。
// 秘匿値は .dev.vars / Secrets で渡す（コミットしない）。

export interface Env {
  /** D1 データベース（wrangler.toml の binding = "DB"）。 */
  DB: D1Database;
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
