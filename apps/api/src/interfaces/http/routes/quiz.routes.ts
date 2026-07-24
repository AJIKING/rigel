// interfaces/http/routes — 特訓クイズのルート（全て認証必須）。
// 開始（無料 1日3回のサーバ強制。402=quota_exceeded）・完了（結果の記録）・
// 履歴（本人の完了済みのみ。他人の成績は返さない）。
// Plan: docs/plans/quiz-training.md

import type { Hono } from "hono";
import { reasonStatus, requireAuth, type AppEnv } from "../shared";

export function registerQuizRoutes(app: Hono<AppEnv>): void {
  // 開始 = 消費（結果 null の行を INSERT。途中離脱も消費のまま）。
  app.post("/quiz/sessions", requireAuth, async (c) => {
    const body = (await c.req.json().catch(() => null)) as { kind?: unknown } | null;
    const result = await c.get("container").startQuizSession.execute({
      userId: c.get("userId")!,
      kind: body?.kind,
    });
    if (!result.ok)
      return c.json({ ok: false, reason: result.reason }, reasonStatus(result.reason));
    return c.json({ ok: true, id: result.id, remainingToday: result.remainingToday }, 201);
  });

  // 完了 = クライアント採点の結果を自分の行に記録（QuizResultSchema はユースケースが強制）。
  app.patch("/quiz/sessions/:id", requireAuth, async (c) => {
    const body = await c.req.json().catch(() => null);
    const result = await c.get("container").finishQuizSession.execute({
      userId: c.get("userId")!,
      sessionId: c.req.param("id"),
      result: body,
    });
    if (!result.ok)
      return c.json({ ok: false, reason: result.reason }, reasonStatus(result.reason));
    return c.json({ ok: true });
  });

  // 履歴（本人の完了済みのみ・新しい順・?since=ISO8601 で期間指定）。
  app.get("/quiz/sessions", requireAuth, async (c) => {
    const result = await c.get("container").listQuizSessions.execute({
      userId: c.get("userId")!,
      since: c.req.query("since"),
    });
    if (!result.ok)
      return c.json({ ok: false, reason: result.reason }, reasonStatus(result.reason));
    // ホワイトリスト整形（userId・startedDay 等の内部情報を出さない）。
    return c.json(
      result.sessions.map((s) => ({
        id: s.id,
        kind: s.kind,
        total: s.total,
        correct: s.correct,
        durationMs: s.durationMs,
        createdAt: s.createdAt.toISOString(),
      })),
    );
  });
}
