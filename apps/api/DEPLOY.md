# rigel-api デプロイ手順

Cloudflare Workers（Hono + D1）への本番デプロイ。GitHub Actions の
[`.github/workflows/deploy.api.yml`](../../.github/workflows/deploy.api.yml) を
手動実行（promote）する。`web`(Next.js) / `mobile`(Expo) は対象外（別配信）。

## 一度だけの準備

1. **D1 を作成**して `wrangler.toml` の `database_id` に反映（反映済み）
   ```bash
   wrangler d1 create rigel   # 出力の database_id を wrangler.toml に貼る
   ```
2. **GitHub に environment `production` を作成**（必要ならレビュワー/ブランチ制限）。
3. **Secrets を登録**（リポジトリ or environment `production`）:
   | Secret | 用途 |
   |---|---|
   | `CLOUDFLARE_API_TOKEN` | Workers/D1 デプロイ権限のある API トークン |
   | `CLOUDFLARE_ACCOUNT_ID` | Cloudflare アカウントID |
   | `SESSION_SECRET` | セッションJWT署名鍵 |
   | `GEMINI_API_KEY` | Gemini API キー |
   | `CLOUDFLARE_AI_GATEWAY_URL` | AI Gateway の google-ai-studio ベースURL |
   | `STRIPE_SECRET_KEY` | Stripe シークレット（未設定なら `/billing/*` は 501） |
   | `STRIPE_WEBHOOK_SECRET` | Stripe Webhook 署名シークレット（`whsec_...`） |

   公開値（`GOOGLE_CLIENT_ID` / `STRIPE_PRICE_NEXT|PRO` / `GEMINI_*_MODEL`）は
   `wrangler.toml` の `[vars]` にコミット済み（Secrets 不要）。
4. **Stripe ダッシュボード**で Webhook を登録：`https://<デプロイ先>/billing/webhook`、
   イベント `checkout.session.completed` / `customer.subscription.deleted`。
   表示された `whsec_...` を `STRIPE_WEBHOOK_SECRET` に設定。
5. **Google OAuth** のクライアントID（公開値）は `wrangler.toml` 済み。web/mobile の
   `NEXT_PUBLIC_GOOGLE_CLIENT_ID` / `EXPO_PUBLIC_GOOGLE_CLIENT_ID` は各配信側で設定。

## デプロイ（promote）

GitHub → Actions → **Deploy rigel-api** → Run workflow → `ref` に検証済みの
`main`（または特定 SHA）を指定して実行。順に:

1. **preflight**: `pnpm typecheck` / `pnpm test` / `wrangler deploy --dry-run`
2. **migrate**: `wrangler d1 migrations apply rigel --remote`
3. **deploy**: `wrangler deploy`（同時に Worker Secrets を投入）

## 確認

```bash
curl https://rigel-api.plaria.workers.dev/health   # {"ok":true}
```

本番デプロイ先（= web/mobile の `EXPO_PUBLIC_API_URL` / `NEXT_PUBLIC_API_URL`）:
**https://rigel-api.plaria.workers.dev**

ローカルでの手元確認・個別の `wrangler secret put` 等は
リポジトリ直下の運用メモ（CLAUDE.md / 過去手順）も参照。
