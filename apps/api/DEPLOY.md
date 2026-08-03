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
   | `CLOUDFLARE_API_TOKEN` | Workers/D1 デプロイ権限＋ **raisha.jp ゾーン権限**のある API トークン（wrangler.toml が routes でカスタムドメインを宣言管理するため。無いと deploy が Auth エラーで落ちる） |
   | `CLOUDFLARE_ACCOUNT_ID` | Cloudflare アカウントID |
   | `SESSION_SECRET` | セッションJWT署名鍵 |
   | `GEMINI_API_KEY` | Gemini API キー |
   | `CLOUDFLARE_AI_GATEWAY_URL` | AI Gateway の **google-ai-studio** ベースURL（`…/compat/...` は不可。2026-08-01 の障害参照） |
   | `CLOUDFLARE_AI_GATEWAY_TOKEN` | Authenticated Gateway のトークン（「AI Gateway - Run」権限。無いと Gemini が 401） |
   | `STRIPE_SECRET_KEY` | Stripe シークレット（未設定なら `/billing/*` は 501） |
   | `STRIPE_WEBHOOK_SECRET` | Stripe Webhook 署名シークレット（`whsec_...`） |
   | `REVENUECAT_WEBHOOK_AUTH` | RevenueCat Webhook の Authorization 照合値（未設定なら受け口 501） |
   | `REVENUECAT_STRIPE_PUBLIC_KEY` | RevenueCat の Stripe config Public API key（`strp_...`） |
   | `APPLE_TEAM_ID` / `APPLE_KEY_ID` / `APPLE_PRIVATE_KEY` | 退会時の Apple トークン失効（3つ未登録なら投入スキップ＝revoke だけ無効） |

   公開値（`GOOGLE_CLIENT_ID` / `STRIPE_PRICE_NEXT|PRO` / `GEMINI_*_MODEL` /
   `ALLOWED_ORIGINS`）は `wrangler.toml` の `[vars]` にコミット済み（Secrets 不要）。

   > **`REVENUECAT_ALLOW_SANDBOX` は本番に置かないこと**（"true" だと無料の
   > サンドボックス購入で有料プランが付く）。`wrangler secret list` に出たら
   > `wrangler secret delete REVENUECAT_ALLOW_SANDBOX` で消す。
   >
   > **⚠️ レート制限は本番で機能していない（2026-08-03 実測・未解決）**。
   > `[[ratelimits]]`（wrangler 4 の第一級キー）でバインディングは解決しているのに
   > `limit()` が常に success を返し、`/auth/google` へ 20 連投しても 429 が出ない
   > （namespace_id を 1001-1004 → 2001-2004 に振り直しても同じ）。Cloudflare 側の
   > 調査が要る。**復旧したかの確認方法**:
   > ```bash
   > for i in $(seq 1 15); do curl -s -o /dev/null -w "%{http_code}\n" \
   >   -X POST https://api.raisha.jp/auth/google \
   >   -H 'content-type: application/json' -d '{"idToken":"invalid"}'; done
   > # 期待: 11 回目以降が 429（RL_AUTH は 10回/分/IP）
   > ```
   > **`ALLOWED_ORIGINS` は CORS と決済の戻り先の唯一の許可リスト**（2026-08-03 に
   > localhost のハードコードを廃止）。ローカル開発は `.dev.vars` に
   > `ALLOWED_ORIGINS=http://localhost:3000` を書く。
4. **非同期解析の基盤（R2 + Queues。docs/plans/async-analysis.md / photo-retention.md）**
   （作成済み 2026-08-03）:
   ```bash
   wrangler r2 bucket create rigel        # 元写真の恒久保存（ライフサイクルは設定しない）
   wrangler queues create rigel-analysis-jobs
   ```
   写真は恒久保存で、削除はデータ削除時のみ（CLAUDE.md ルール7・[決定] 2026-08-03）。
   **TTL を設定しないこと**（付けるとユーザーの写真が消える）。バインディング
   （`PHOTOS`）は `wrangler.toml` にコミット済み。
   旧 `rigel-analysis-tmp`（TTL 1日の一時バケット）は 2026-08-03 に削除済み。
5. **Stripe ダッシュボード**で Webhook を登録：`https://<デプロイ先>/billing/webhook`、
   イベント `checkout.session.completed` / `customer.subscription.deleted`。
   表示された `whsec_...` を `STRIPE_WEBHOOK_SECRET` に設定。
6. **Google OAuth** のクライアントID（公開値）は `wrangler.toml` 済み。web/mobile の
   `NEXT_PUBLIC_GOOGLE_CLIENT_ID` / `EXPO_PUBLIC_GOOGLE_CLIENT_ID` は各配信側で設定。

## デプロイ（promote）

GitHub → Actions → **Deploy rigel-api** → Run workflow → `ref` に検証済みの
`main`（または特定 SHA）を指定して実行。順に:

1. **preflight**: `pnpm typecheck` / `pnpm test` / `wrangler deploy --dry-run`
2. **migrate**: `wrangler d1 migrations apply rigel --remote`
3. **deploy**: `wrangler deploy`（同時に Worker Secrets を投入）

## 確認

```bash
curl https://api.raisha.jp/health   # {"ok":true}
```

本番デプロイ先（= web/mobile の `EXPO_PUBLIC_API_URL` / `NEXT_PUBLIC_API_URL`）:
**https://api.raisha.jp**

ローカルでの手元確認・個別の `wrangler secret put` 等は
リポジトリ直下の運用メモ（CLAUDE.md / 過去手順）も参照。

## IAP（アプリ内課金）の外部設定

> 旧記述（自前の `/billing/appstore/*` エンドポイント・`APPSTORE_PRODUCT_*` 設定）は
> **RevenueCat 移行で廃止済み**（該当コード・設定はリポジトリに存在しない）。
> 現行の真実源は RevenueCat（Webhook だけが plan を書く。docs/plans/billing-revenuecat.md）。

1. **RevenueCat ダッシュボード**: プロジェクトに App Store / Play アプリを登録し、
   Entitlement `next` / `pro` と商品をマッピング。
2. **Webhook**: RevenueCat → `https://api.raisha.jp/billing/revenuecat/webhook`。
   Authorization ヘッダの値を Secret `REVENUECAT_WEBHOOK_AUTH` と一致させる。
3. **ストアの商品登録**: App Store Connect / Play Console でサブスク商品を作成し、
   RevenueCat の商品設定・`apps/mobile/lib/purchases-keys.ts` の API キーと整合させる。
4. mobile は **dev build / Codemagic 必須**（RevenueCat SDK はネイティブモジュール）。
