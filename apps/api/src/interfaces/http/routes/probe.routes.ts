// 一時検証ルート（docs/plans/async-analysis.md Task 1。検証が済んだらファイルごと削除する）。
// ctx.waitUntil が応答（202）後に数分の I/O 待ちを完走できるかを本番 Worker で実測する。
// 完走の観測は console.log × wrangler tail / Workers Logs（チェックポイントごとに出力）。
// ゲートは REVIEW_LOGIN_SECRET（審査用と同じ期間限定 Secret。未設定なら 501）。

import type { Hono } from "hono";
import { timingSafeEqual } from "../../../domain/auth/timing-safe-equal";
import type { AppEnv } from "../shared";

const CHECKPOINT_SECONDS = [30, 60, 120, 180, 240, 300];

export function registerProbeRoutes(app: Hono<AppEnv>): void {
  app.post("/debug/wait-until-probe", (c) => {
    const secret = c.env.REVIEW_LOGIN_SECRET;
    if (!secret) return c.json({ error: "not configured" }, 501);
    if (!timingSafeEqual(c.req.header("x-probe-secret"), secret)) {
      return c.json({ error: "unauthorized" }, 401);
    }

    const startedAt = Date.now();
    c.executionCtx.waitUntil(
      (async () => {
        for (const s of CHECKPOINT_SECONDS) {
          const remaining = s * 1000 - (Date.now() - startedAt);
          if (remaining > 0) await new Promise((r) => setTimeout(r, remaining));
          console.log(`waitUntil probe alive: ${s}s`);
        }
        console.log(`waitUntil probe done: ${Math.round((Date.now() - startedAt) / 1000)}s`);
      })(),
    );
    return c.json({ ok: true, startedAt }, 202);
  });
}
