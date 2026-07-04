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

## IAP（App Store / iOS 課金）の外部設定

コード側は実装済み（`/billing/appstore/redeem`・`/billing/appstore/notifications`、
検証は Apple Root CA G3 固定 + x5c チェーン検証。設定は `wrangler.toml` の
`APPLE_BUNDLE_ID` / `APPSTORE_PRODUCT_NEXT` / `APPSTORE_PRODUCT_PRO`）。
公開前に App Store Connect で以下の手作業が必要:

1. **サブスク商品の登録**: 自動更新サブスクリプションを2つ作成。
   productId は **`rigel.next.monthly`（¥624 相当 Tier）/ `rigel.pro.monthly`（¥1,924 相当 Tier）**。
   ※ `wrangler.toml` と `apps/mobile/lib/iap.ts` の PRODUCT_IDS と完全一致させる。
2. **Server Notifications V2 の URL 設定**: App Store Connect → App → App 情報 →
   「App Store サーバ通知」→ Production/Sandbox とも
   `https://rigel-api.plaria.workers.dev/billing/appstore/notifications`（V2 を選択）。
3. **Sandbox テスター**でエンドツーエンド確認:
   購入 → `/me` の plan 反映 →（Sandbox の高速更新で）DID_RENEW / EXPIRED の反映。
4. mobile は **EAS dev build 必須**（expo-iap はネイティブモジュール。Expo Go では動かない）。

注意: D1 マイグレーション `0005`（users.appstore_original_transaction_id）が
デプロイ時に適用される（Actions の migrate ステップ）。
