// ============================================================
// apps/api — Cloudflare Workers エントリ
// ------------------------------------------------------------
// DDD レイヤード構成（domain / application / infrastructure / interfaces）。
// アーキテクチャは docs/開発ガイド/05_APIアーキテクチャ.md を参照。
// ここは Hono アプリを公開するだけ（依存の組み立ては composition-root）。
// ============================================================

import { createApp } from "./interfaces/http/app";

export default createApp();
