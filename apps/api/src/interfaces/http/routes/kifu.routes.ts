// interfaces/http/routes — 牌譜（局）のルート。
// 検証・取得・更新・削除・一覧、および撮影画像の解析（/analyze）。

import { CameraSeatSchema, SeatSchema } from "@rigel/schema";
import type { Hono } from "hono";
import type { ImageRef } from "../../../domain/kifu/analyzer";
import { reasonStatus, requireAuth, type AppEnv } from "../shared";
import { asFile, isValidImageFile, toImageRef, MAX_IMAGE_COUNT } from "../limits";
import { parseKifu } from "../validate";

export function registerKifuRoutes(app: Hono<AppEnv>): void {
  // 牌譜JSONの検証のみ（保存はしない）。背骨スキーマで弾く。
  app.post("/kifu/validate", async (c) => {
    const body: unknown = await c.req.json().catch(() => null);
    const parsed = parseKifu(body);
    if (!parsed.ok) return c.json({ ok: false, errors: parsed.errors }, 400);
    return c.json({ ok: true });
  });

  // 牌譜1件の取得。可視性（public は誰でも、private は所有者のみ）は
  // application 層で判定し、見えない局は不存在と同じ 404（存在を漏らさない）。
  app.get("/kifu/:id", async (c) => {
    const log = await c
      .get("container")
      .getKifu.execute(c.req.param("id"), c.get("userId") ?? null);
    if (!log) return c.json({ error: "not found" }, 404);
    return c.json(log);
  });

  // 牌譜（局）の削除（所有者のみ）。
  app.delete("/kifu/:id", requireAuth, async (c) => {
    const result = await c.get("container").deleteKifu.execute({
      userId: c.get("userId")!,
      logId: c.req.param("id"),
    });
    if (!result.ok) return c.json({ error: "not found" }, 404);
    return c.json({ ok: true });
  });

  // 牌譜の修正を保存（所有者のみ）。body は { kifu, seq? }。
  // 下書き/編集済は半荘単位（PATCH /games/:id/status）なのでここでは受けない。
  app.put("/kifu/:id", requireAuth, async (c) => {
    // 旧クライアント互換で「body 自体が Kifu」も受ける。
    const body = (await c.req.json().catch(() => null)) as {
      kifu?: unknown;
      seq?: unknown;
    } | null;
    const hasWrap = !!body && typeof body === "object" && "kifu" in body;
    const parsed = parseKifu(hasWrap ? body.kifu : body);
    if (!parsed.ok) return c.json({ ok: false, errors: parsed.errors }, 400);
    const result = await c.get("container").updateKifu.execute({
      userId: c.get("userId")!,
      logId: c.req.param("id"),
      kifu: parsed.kifu,
      seq: typeof body?.seq === "number" ? body.seq : undefined,
    });
    if (!result.ok) {
      if (result.reason === "not_found") return c.json({ error: "not found" }, 404);
      return c.json({ ok: false, reason: result.reason }, reasonStatus(result.reason));
    }
    return c.json({ ok: true });
  });

  // ユーザーの牌譜一覧。public は誰でも、private は本人にだけ見せる
  //（可視性の判定は application 層）。
  app.get("/users/:id/kifu", async (c) => {
    const logs = await c
      .get("container")
      .listKifu.execute(c.req.param("id"), c.get("userId") ?? null);
    return c.json(logs);
  });

  // 撮影画像 → 解析 → 半荘に局として保存（multipart）。
  // フォーム: river(file), cameraBottomSeat(east|south|west|north),
  //          hand_bottom/right/top/left(file 任意), gameId(任意=既存半荘へ追加)。
  app.post("/analyze", requireAuth, async (c) => {
    const userId = c.get("userId")!;

    const form = await c.req.formData().catch(() => null);
    const river = asFile(form?.get("river"));
    const seat = SeatSchema.safeParse(form?.get("cameraBottomSeat"));
    if (!river || !seat.success) {
      return c.json(
        { error: "river(file) と cameraBottomSeat(east/south/west/north) が必要です" },
        400,
      );
    }

    // 画像の妥当性は「バイトを読む前」に File のメタデータ（size/type）で判定する。
    // 任意バイト列を画像として Gemini に送らない・巨大画像で Worker のメモリを焼かせない。
    const handFiles = CameraSeatSchema.options
      .map((cam) => [cam, asFile(form?.get(`hand_${cam}`))] as const)
      .filter((e): e is [(typeof CameraSeatSchema.options)[number], File] => e[1] !== null);
    const files = [river, ...handFiles.map(([, f]) => f)];
    if (files.length > MAX_IMAGE_COUNT || !files.every(isValidImageFile)) {
      return c.json({ error: "画像は JPEG/PNG/WebP/HEIC、1枚あたりの上限を超えないこと" }, 400);
    }

    // 枠のプリフライト（画像をメモリへ載せる前）。free（枠0）や上限到達のユーザーに
    // 巨大画像のバッファリングをさせない。
    const analyze = c.get("container").analyzeAndSaveKifu;
    const pre = await analyze.preflight(userId);
    if (!pre.ok) return c.json({ ok: false, reason: pre.reason }, reasonStatus(pre.reason));

    const hands: Partial<Record<(typeof CameraSeatSchema.options)[number], ImageRef>> = {};
    for (const [cam, f] of handFiles) hands[cam] = await toImageRef(f);
    const riverImage = await toImageRef(river);

    const gameIdRaw = form?.get("gameId");
    const gameId = typeof gameIdRaw === "string" && gameIdRaw ? gameIdRaw : undefined;
    // 1枚モード: 河写真から手前の手牌も読む（docs/plans/one-shot-hand.md）。
    const handFromRiver = form?.get("handFromRiver") === "true";

    // 非同期ジョブ化（docs/plans/async-analysis.md）: 実写真の Gemini 読み取りは数分に
    // 達しうるため、接続を握ったまま解析しない。画像を R2 に一時保存（[決定] 2026-08-01
    // ハードルール変更・処理後に即削除）してキューへ投入し、202 + jobId を即返す。
    // 結果はポーリング（GET /analyze/jobs/:id）で取る。
    const started = await c.get("container").startAnalysisJob.start({
      userId,
      ...(gameId ? { gameId } : {}),
      cameraBottomSeat: seat.data,
      riverImage,
      hands,
      ...(handFromRiver ? { handFromRiver: true } : {}),
    });
    if (!started.ok) {
      return c.json({ ok: false, reason: started.reason }, reasonStatus(started.reason));
    }
    return c.json({ ok: true, jobId: started.jobId }, 202);
  });

  // 解析ジョブの状態（所有者のみ。ポーリング用 = RL_READ の対象）。
  // 他人・不存在は 404（存在を漏らさない）。
  app.get("/analyze/jobs/:id", requireAuth, async (c) => {
    const job = await c
      .get("container")
      .getAnalysisJob.execute(c.req.param("id"), c.get("userId")!);
    if (!job) return c.json({ error: "not found" }, 404);
    return c.json(job);
  });
}
