# rigel-web デプロイ手順

Next.js(App Router) を **Cloudflare Workers** へ SSR 配信する。アダプタは
[`@opennextjs/cloudflare`](https://opennext.js.org/cloudflare)。動的ルート
（`/kifu/[gameId]/[logId]` `/u/[handle]` `/k/[gameId]`）があり static export は
できないため、Workers のサーバランタイムで動かす。デプロイは GitHub Actions の
[`.github/workflows/deploy.web.yml`](../../.github/workflows/deploy.web.yml) を手動実行する。

## 構成

| ファイル | 役割 |
|---|---|
| `wrangler.jsonc` | Worker 設定（name `rigel-web` / `nodejs_compat` / Assets バインディング） |
| `open-next.config.ts` | OpenNext 設定（増分キャッシュ無し＝ISR 未使用） |
| `next.config.mjs` | `initOpenNextCloudflareForDev()` を呼び dev で CF バインディングを有効化 |
| scripts | `cf:build`（next build→OpenNext 変換） / `cf:preview` / `cf:deploy` |

## 一度だけの準備

1. **environment `production`**（api と共用）。`CLOUDFLARE_API_TOKEN` /
   `CLOUDFLARE_ACCOUNT_ID` を使う（api 用に登録済みのものを流用）。
2. **GitHub Variables（公開ビルド値）** を登録（Secrets ではなく Variables でよい
   ＝バンドルに焼かれる公開値）:
   | Variable | 用途 | 既定 |
   |---|---|---|
   | `NEXT_PUBLIC_API_URL` | 本番 API のベースURL | `https://rigel-api.plaria.workers.dev` |
   | `NEXT_PUBLIC_GOOGLE_CLIENT_ID` | Google OAuth Web クライアントID | （必須） |
3. 初回 `cf:deploy` で Worker `rigel-web` は自動作成される。

## デプロイ（promote）

GitHub → Actions → **Deploy rigel-web** → Run workflow → `ref` に検証済みの
`main`（または特定 SHA）を指定。順に:

1. **preflight**: `pnpm typecheck` / `pnpm test`
2. **deploy**: `pnpm --filter web cf:deploy`（内部で next build → OpenNext 変換 →
   `wrangler deploy`。`NEXT_PUBLIC_*` はこの build 時にバンドルへ焼かれる）

## ローカル確認の注意（Windows）

`cf:build` は Next.js の `output: standalone` を使う。pnpm のストアへ**シンボリック
リンク**を張るため、**Windows ではローカルビルドが `EPERM` で失敗する**（開発者モード/
管理者権限が必要）。CI（Linux）では問題なくビルドできるため、ビルド検証は CI で行う。
ローカルでサーバ挙動を確認したい場合は WSL/Linux か、開発者モード有効化のうえ
`pnpm --filter web cf:preview`。

```bash
# 通常の開発（CF ランタイムは使わない）
pnpm --filter web dev
# Workers ランタイムでのローカルプレビュー（Linux / 開発者モード）
pnpm --filter web cf:preview
```
