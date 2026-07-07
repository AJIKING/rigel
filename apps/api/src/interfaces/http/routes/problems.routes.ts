// interfaces/http/routes — 何切る問題のルート。
// 公開一覧・詳細（published は誰でも / draft は所有者のみ）・作成/更新/削除（所有者）・
// 回答（認証必須・1人1回 upsert・レスポンスはシンプル）・分布（認証必須）。
// 保存上限は free 20問（draft+published 合算。reason: problem_limit → 403）。

import type { Hono } from "hono";
import { reasonStatus, requireAuth, type AppEnv } from "../shared";

/** body から status を安全に取り出す（不正値は undefined）。 */
function parseStatus(v: unknown): "draft" | "published" | undefined {
  return v === "draft" || v === "published" ? v : undefined;
}

export function registerProblemRoutes(app: Hono<AppEnv>): void {
  // 公開一覧（published のみ・新着順。閲覧は自由）。
  app.get("/problems", async (c) => {
    const posts = await c.get("container").listPublishedProblems.execute();
    return c.json(posts);
  });

  // 自分の一覧（draft 含む）。
  app.get("/problems/mine", requireAuth, async (c) => {
    const posts = await c.get("container").listMyProblems.execute(c.get("userId")!);
    return c.json(posts);
  });

  // 詳細。published は誰でも・draft は所有者のみ（他人には存在を伏せて 404）。
  // 分布は含めない（GET /problems/:id/stats へ。認証必須）。
  app.get("/problems/:id", async (c) => {
    const post = await c.get("container").getProblem.execute(c.req.param("id"), c.get("userId"));
    if (!post) return c.json({ error: "not found" }, 404);
    return c.json(post);
  });

  // 作成。free は合算20問で 403（problem_limit）。
  app.post("/problems", requireAuth, async (c) => {
    const body = (await c.req.json().catch(() => null)) as {
      title?: unknown;
      problem?: unknown;
      status?: unknown;
    } | null;
    const result = await c.get("container").createProblem.execute({
      userId: c.get("userId")!,
      title: typeof body?.title === "string" ? body.title : "",
      problem: body?.problem,
      status: parseStatus(body?.status),
    });
    if (!result.ok)
      return c.json({ ok: false, reason: result.reason }, reasonStatus(result.reason));
    return c.json({ ok: true, problemId: result.problemId }, 201);
  });

  // 更新（タイトル・問題本体・draft/published 切替）。所有者のみ。
  app.put("/problems/:id", requireAuth, async (c) => {
    const body = (await c.req.json().catch(() => null)) as {
      title?: unknown;
      problem?: unknown;
      status?: unknown;
    } | null;
    const result = await c.get("container").updateProblem.execute({
      userId: c.get("userId")!,
      problemId: c.req.param("id"),
      title: typeof body?.title === "string" ? body.title : undefined,
      problem: body?.problem === undefined ? undefined : body.problem,
      status: parseStatus(body?.status),
    });
    if (!result.ok)
      return c.json({ ok: false, reason: result.reason }, reasonStatus(result.reason));
    return c.json({ ok: true });
  });

  // 削除（ぶら下がる回答ごと）。所有者のみ。
  app.delete("/problems/:id", requireAuth, async (c) => {
    const result = await c.get("container").deleteProblem.execute({
      userId: c.get("userId")!,
      problemId: c.req.param("id"),
    });
    if (!result.ok) return c.json({ error: "not found" }, 404);
    return c.json({ ok: true });
  });

  // 回答（1人1回・再回答は上書き）。認証必須。レスポンスはシンプル（分布は stats で取る）。
  app.post("/problems/:id/answers", requireAuth, async (c) => {
    const body = (await c.req.json().catch(() => null)) as { action?: unknown } | null;
    const result = await c.get("container").answerProblem.execute({
      userId: c.get("userId")!,
      problemId: c.req.param("id"),
      action: body?.action,
    });
    if (!result.ok)
      return c.json({ ok: false, reason: result.reason }, reasonStatus(result.reason));
    return c.json({ ok: true });
  });

  // 回答分布（choiceKey ごとの件数＋合計＋自分の回答）。認証必須。
  app.get("/problems/:id/stats", requireAuth, async (c) => {
    const stats = await c.get("container").getProblemStats.execute({
      userId: c.get("userId")!,
      problemId: c.req.param("id"),
    });
    if (!stats) return c.json({ error: "not found" }, 404);
    return c.json(stats);
  });
}
