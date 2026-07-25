// interfaces/http/routes — 何切る問題のルート。
// 公開一覧・詳細（published は誰でも / draft は所有者のみ）・作成/更新/削除（所有者）・
// 回答（認証必須・1人1回 upsert・レスポンスはシンプル）・分布（認証必須）。
// 保存上限は free 20問（draft+published 合算。reason: problem_limit → 403）。

import { SeatSchema } from "@rigel/schema";
import type { Hono } from "hono";
import type { AnalysisInput } from "../../../domain/kifu/analyzer";
import { asFile, isValidImageFile, toImageRef, MAX_IMAGE_COUNT } from "../limits";
import { reasonStatus, requireAuth, type AppEnv } from "../shared";

/** body から status を安全に取り出す（不正値は undefined）。 */
function parseStatus(v: unknown): "draft" | "published" | undefined {
  return v === "draft" || v === "published" ? v : undefined;
}

export function registerProblemRoutes(app: Hono<AppEnv>): void {
  // 撮影画像 → 何切るドラフト（**保存しない**。Kifu 形のドラフトを返すだけ。画像も非保存）。
  // フォーム: hand(file 必須=自分の手牌), river(file 任意), cameraBottomSeat(任意・既定 east=出題視点)。
  // Plan: docs/plans/problem-photo-analyze.md
  app.post("/problems/analyze", requireAuth, async (c) => {
    const userId = c.get("userId")!;

    const form = await c.req.formData().catch(() => null);
    const hand = asFile(form?.get("hand"));
    if (!hand) return c.json({ error: "hand(file・自分の手牌) が必要です" }, 400);
    const river = asFile(form?.get("river"));
    const seat = SeatSchema.safeParse(form?.get("cameraBottomSeat"));

    // 画像の妥当性は「バイトを読む前」に File のメタデータで判定（/analyze と同じ入口規律）。
    const files = river ? [hand, river] : [hand];
    if (files.length > MAX_IMAGE_COUNT || !files.every(isValidImageFile)) {
      return c.json({ error: "画像は JPEG/PNG/WebP/HEIC、1枚あたりの上限を超えないこと" }, 400);
    }

    // 枠のプリフライト（画像をメモリへ載せる前）。free（枠0）はここで弾く。
    const uc = c.get("container").analyzeProblemDraft;
    const pre = await uc.preflight(userId);
    if (!pre.ok) return c.json({ ok: false, reason: pre.reason }, reasonStatus(pre.reason));

    const input: AnalysisInput = {
      riverImage: river ? await toImageRef(river) : undefined,
      hands: { bottom: await toImageRef(hand) },
      cameraBottomSeat: seat.success ? seat.data : "east",
    };

    try {
      const result = await uc.execute({ userId, input });
      if (!result.ok) {
        return c.json({ ok: false, reason: result.reason }, reasonStatus(result.reason));
      }
      return c.json({ ok: true, kifu: result.kifu });
    } catch (e) {
      console.error("POST /problems/analyze failed", e);
      return c.json({ ok: false, error: "解析に失敗しました" }, 502);
    }
  });

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
