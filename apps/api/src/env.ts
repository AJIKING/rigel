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
}
