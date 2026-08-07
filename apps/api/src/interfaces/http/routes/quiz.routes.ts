// interfaces/http/routes — 特訓クイズのルート。
// 開始（無料 1日 FREE_QUIZ_PER_DAY 回のサーバ強制。402=quota_exceeded）・完了（結果の記録）・
// 履歴（本人の完了済みのみ。他人の成績は返さない）は認証必須。
// ランキング（/ranking）だけは匿名可（verified セッションの集計値のみ。[決定] 2026-08-04
// 強制表示。公開するのは常時公開のプロフィール情報=handle/displayName と集計値だけ）。
// Plan: docs/plans/quiz-training.md / docs/plans/quiz-open-and-ranking.md

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
    // seed はサーバ発行（クライアントはこのシードで出題し、完了時にサーバが同じシードで
    // 再生成・再採点する。Plan: docs/plans/quiz-open-and-ranking.md Phase 4）。
    return c.json(
      { ok: true, id: result.id, seed: result.seed, remainingToday: result.remainingToday },
      201,
    );
  });

  // 完了 = 結果＋全回答を自分の行に記録（QuizFinishSchema とシードリプレイ再採点は
  // ユースケースが強制）。
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

  // セッション詳細（本人のみ）。records=見直しレコードは現在の plan が有料のときだけ
  // （ダウングレード時は全て閲覧不可 [決定] 2026-08-04 ⑤）。
  app.get("/quiz/sessions/:id", requireAuth, async (c) => {
    const result = await c.get("container").getQuizSession.execute({
      userId: c.get("userId")!,
      sessionId: c.req.param("id"),
    });
    if (!result.ok)
      return c.json({ ok: false, reason: result.reason }, reasonStatus(result.reason));
    const s = result.session;
    // ホワイトリスト整形（userId・startedDay・seed 等の内部情報を出さない）。
    return c.json({
      id: s.id,
      kind: s.kind,
      total: s.total,
      correct: s.correct,
      durationMs: s.durationMs,
      createdAt: s.createdAt.toISOString(),
      records: result.records,
    });
  });

  // ランキング（匿名可）。?kind=score|efficiency|chinitsu|chinitsuUkeire・
  // ?period=weekly|monthly|all（省略時 weekly）。サインイン時は自分の順位（me）付き。
  app.get("/ranking", async (c) => {
    const viewerId = c.get("userId") ?? null;
    const result = await c.get("container").getQuizRanking.execute({
      kind: c.req.query("kind"),
      period: c.req.query("period") ?? "weekly",
      viewerId,
    });
    if (!result.ok)
      return c.json({ ok: false, reason: result.reason }, reasonStatus(result.reason));
    // 匿名応答は個人化が無いので短期キャッシュ可。me 付き（サインイン）はキャッシュさせない。
    c.header("cache-control", viewerId === null ? "public, max-age=60" : "private, no-store");
    return c.json({
      kind: result.kind,
      period: result.period,
      entries: result.entries,
      me: result.me,
    });
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
