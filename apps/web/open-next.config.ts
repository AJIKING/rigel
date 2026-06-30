import { defineCloudflareConfig } from "@opennextjs/cloudflare";

// OpenNext の Cloudflare Workers アダプタ設定。
// 本アプリは ISR/オンデマンド再検証を使わず、データは全てクライアントから
// API（rigel-api）を叩いて取得するため、増分キャッシュ（R2/KV）は無効のまま。
// 将来 ISR を使う場合のみ incrementalCache 等を追加する。
export default defineCloudflareConfig();
