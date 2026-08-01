// ============================================================
// apps/api — Cloudflare Workers エントリ
// ------------------------------------------------------------
// DDD レイヤード構成（domain / application / infrastructure / interfaces）。
// アーキテクチャは docs/開発ガイド/05_APIアーキテクチャ.md を参照。
// ここは Hono アプリ（HTTP）と解析ジョブの queue consumer を公開するだけ
// （依存の組み立ては composition-root）。
// ============================================================

import { buildContainer } from "./composition-root";
import type { AnalysisJobMessage } from "./domain/analysis/analysis-transport";
import type { Env } from "./env";
import { createApp } from "./interfaces/http/app";
import { consumeAnalysisBatch } from "./interfaces/queue/analysis-consumer";

const app = createApp();

export default {
  fetch: app.fetch,
  // 解析ジョブの consumer（docs/plans/async-analysis.md。wrangler.toml の queues.consumers）。
  async queue(batch: MessageBatch<AnalysisJobMessage>, env: Env): Promise<void> {
    await consumeAnalysisBatch(batch, buildContainer(env).runAnalysisJob);
  },
};
