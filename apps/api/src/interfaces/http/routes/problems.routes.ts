// interfaces/http/routes — 何切る問題のルート。
// 公開一覧・詳細（published は誰でも / draft は所有者のみ）・作成/更新/削除（所有者）・
// 回答（認証必須・1人1回 upsert・レスポンスはシンプル）・分布（認証必須）。
// 保存上限は free 20問（draft+published 合算。reason: problem_limit → 403）。

import { SeatSchema } from "@rigel/schema";
import type { Context, Hono } from "hono";
import {
  isProblemPhotoKind,
  type ProblemPhotoRef,
} from "../../../application/problem-photos.usecase";
import { asFile, isValidImageFile, toImageRef, MAX_IMAGE_COUNT } from "../limits";
import {
  photoBody,
  problemJson,
  reasonStatus,
  requireAuth,
  withFavorites,
  type AppEnv,
} from "../shared";

/** body から status を安全に取り出す（不正値は undefined）。 */
function parseStatus(v: unknown): "draft" | "published" | undefined {
  return v === "draft" || v === "published" ? v : undefined;
}

/** 元写真のバイト配信（問題/下書き共通）。kind は許可リスト・所有者のみ・404 で伏せる。 */
async function serveProblemPhoto(
  c: Context<AppEnv>,
  ref: ProblemPhotoRef,
  jobId: string,
  kind: string,
) {
  if (!isProblemPhotoKind(kind)) return c.json({ error: "not found" }, 404);
  const photo = await c.get("container").problemPhotos.get(c.get("userId")!, ref, jobId, kind);
  if (!photo) return c.json({ error: "not found" }, 404);
  return photoBody(c, photo);
}

export function registerProblemRoutes(app: Hono<AppEnv>): void {
  // 撮影画像 → 何切るの解析下書き（photo-retention.md・[決定] 2026-08-03）。
  // 送信時に下書きを先行作成し、写真は R2（problems/{draftId}/…）へ恒久保存。
  // 202 + jobId + draftId を即返し、解析結果（Kifu 形）は下書き（problem_drafts）に入る。
  // フォーム: hand(file 必須=自分の手牌), river(file 任意), cameraBottomSeat(任意・既定 east=出題視点)。
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
    const pre = await c.get("container").analyzeProblemDraft.preflight(userId);
    if (!pre.ok) return c.json({ ok: false, reason: pre.reason }, reasonStatus(pre.reason));

    const started = await c.get("container").startProblemAnalysisJob.start({
      userId,
      cameraBottomSeat: seat.success ? seat.data : "east",
      handImage: await toImageRef(hand),
      ...(river ? { riverImage: await toImageRef(river) } : {}),
    });
    if (!started.ok) {
      return c.json({ ok: false, reason: started.reason }, reasonStatus(started.reason));
    }
    // draftId も返す（解析下書きの先行作成。閉じてもマイページの下書きから開ける）。
    return c.json({ ok: true, jobId: started.jobId, draftId: started.draftId }, 202);
  });

  // 何切る解析ジョブの状態（所有者のみ。ポーリング用 = RL_READ の対象）。
  // done なら結果ドラフト（Kifu 形・Zod 検証済み）を同梱。他人・不存在は 404。
  app.get("/problems/analyze/jobs/:id", requireAuth, async (c) => {
    const job = await c
      .get("container")
      .getProblemAnalysisJob.execute(c.req.param("id"), c.get("userId")!);
    if (!job) return c.json({ error: "not found" }, 404);
    return c.json(job);
  });

  // 解析下書き（photo-retention.md）。写真AI再現の送信で先行作成され、閉じてもここに残る。
  // すべて所有者のみ。※ /problems/:id より先に登録する（"drafts" を :id に食わせない）。
  app.get("/problems/drafts", requireAuth, async (c) => {
    const drafts = await c.get("container").listProblemDrafts.execute(c.get("userId")!);
    return c.json({ drafts });
  });

  // 下書きの詳細（ready なら解析結果の Kifu 同梱。編集画面への流し込み用）。
  app.get("/problems/drafts/:id", requireAuth, async (c) => {
    const draft = await c
      .get("container")
      .getProblemDraft.execute(c.req.param("id"), c.get("userId")!);
    if (!draft) return c.json({ error: "not found" }, 404);
    return c.json(draft);
  });

  // 解析下書きの元写真（一覧・配信。所有者のみ。photo-retention.md）。
  app.get("/problems/drafts/:id/photos", requireAuth, async (c) => {
    const photos = await c
      .get("container")
      .problemPhotos.list(c.get("userId")!, { draftId: c.req.param("id") });
    if (!photos) return c.json({ error: "not found" }, 404);
    return c.json({ photos });
  });
  app.get("/problems/drafts/:id/photos/:jobId/:kind", requireAuth, async (c) =>
    serveProblemPhoto(c, { draftId: c.req.param("id") }, c.req.param("jobId"), c.req.param("kind")),
  );

  // 下書きの破棄（写真ごと消す）。
  app.delete("/problems/drafts/:id", requireAuth, async (c) => {
    const result = await c.get("container").deleteProblemDraft.execute({
      userId: c.get("userId")!,
      draftId: c.req.param("id"),
    });
    if (!result.ok) return c.json({ error: "not found" }, 404);
    return c.json({ ok: true });
  });

  // 公開一覧（published のみ・新着順。閲覧は自由）。
  // カードにはお気に入り数（人気順の並べ替えに使う）と自分が付けたかを載せる。
  app.get("/problems", async (c) => {
    const posts = await c.get("container").listPublishedProblems.execute();
    const withFav = await withFavorites(c, "problem", posts);
    return c.json(withFav.map((p) => problemJson(p, c.get("userId"))));
  });

  // 自分の一覧（draft 含む）。
  app.get("/problems/mine", requireAuth, async (c) => {
    const posts = await c.get("container").listMyProblems.execute(c.get("userId")!);
    return c.json(await withFavorites(c, "problem", posts));
  });

  // 問題の元写真（解析下書きから引き継いだもの。所有者のみ＝公開問題でも露出しない）。
  app.get("/problems/:id/photos", requireAuth, async (c) => {
    const photos = await c
      .get("container")
      .problemPhotos.list(c.get("userId")!, { problemId: c.req.param("id") });
    if (!photos) return c.json({ error: "not found" }, 404);
    return c.json({ photos });
  });
  app.get("/problems/:id/photos/:jobId/:kind", requireAuth, async (c) =>
    serveProblemPhoto(
      c,
      { problemId: c.req.param("id") },
      c.req.param("jobId"),
      c.req.param("kind"),
    ),
  );

  // 詳細。published は誰でも・draft は所有者のみ（他人には存在を伏せて 404）。
  // 分布は含めない（GET /problems/:id/stats へ。認証必須）。
  app.get("/problems/:id", async (c) => {
    const post = await c.get("container").getProblem.execute(c.req.param("id"), c.get("userId"));
    if (!post) return c.json({ error: "not found" }, 404);
    const [withFav] = await withFavorites(c, "problem", [post]);
    return c.json(problemJson(withFav!, c.get("userId")));
  });

  // 作成。free は合算20問で 403（problem_limit）。
  // draftId 指定で解析下書きから正規保存（写真を引き継ぎ、下書きを畳む）。
  app.post("/problems", requireAuth, async (c) => {
    const body = (await c.req.json().catch(() => null)) as {
      title?: unknown;
      problem?: unknown;
      status?: unknown;
      draftId?: unknown;
    } | null;
    const result = await c.get("container").createProblem.execute({
      userId: c.get("userId")!,
      title: typeof body?.title === "string" ? body.title : "",
      problem: body?.problem,
      status: parseStatus(body?.status),
      ...(typeof body?.draftId === "string" && body.draftId ? { draftId: body.draftId } : {}),
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
