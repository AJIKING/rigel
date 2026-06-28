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
  /** Google OAuth クライアントID（ID トークンの aud 検証に使う）。 */
  GOOGLE_CLIENT_ID: string;
  /** セッショントークンの署名鍵（Secret）。 */
  SESSION_SECRET: string;
  /** Stripe シークレットキー（Secret。未設定なら課金機能は無効）。 */
  STRIPE_SECRET_KEY?: string;
  /** Stripe Webhook 署名シークレット（Secret）。 */
  STRIPE_WEBHOOK_SECRET?: string;
  /** サブスクの価格ID（price_...）。 */
  STRIPE_PRICE_ID?: string;
}
