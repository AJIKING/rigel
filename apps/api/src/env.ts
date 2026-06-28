// Worker のバインディング/環境変数。wrangler.toml と対応させる。
// 秘匿値は .dev.vars / Secrets で渡す（コミットしない）。

export interface Env {
  /** D1 データベース（wrangler.toml の binding = "DB"）。 */
  DB: D1Database;
  /** Gemini API キー（Secret）。 */
  GEMINI_API_KEY: string;
  /** Cloudflare AI Gateway のエンドポイント。 */
  CLOUDFLARE_AI_GATEWAY_URL: string;
}
