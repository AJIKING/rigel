// interfaces/http/routes — 牌譜（局）のルート。
// 検証・取得・更新・削除・一覧、および撮影画像の解析（/analyze）。

import { CameraSeatSchema, SeatSchema } from "@rigel/schema";
import type { Hono } from "hono";
import type { AnalysisInput, ImageRef } from "../../../domain/kifu/analyzer";
import { reasonStatus, requireAuth, type AppEnv } from "../shared";
import { parseKifu } from "../validate";

function asFile(value: unknown): File | null {
  return value instanceof File ? value : null;
}

async function toImageRef(file: File): Promise<ImageRef> {
  return { data: await file.arrayBuffer(), mimeType: file.type || "image/jpeg" };
}

export function registerKifuRoutes(app: Hono<AppEnv>): void {
  // 牌譜JSONの検証のみ（保存はしない）。背骨スキーマで弾く。
  app.post("/kifu/validate", async (c) => {
    const body: unknown = await c.req.json().catch(() => null);
    const parsed = parseKifu(body);
    if (!parsed.ok) return c.json({ ok: false, errors: parsed.errors }, 400);
    return c.json({ ok: true });
  });

  // 牌譜1件の取得（public は誰でも、private は所有者のみ）。
  app.get("/kifu/:id", async (c) => {
    const log = await c.get("container").getKifu.execute(c.req.param("id"));
    if (!log) return c.json({ error: "not found" }, 404);
    if (log.visibility === "private" && log.userId !== c.get("userId")) {
      return c.json({ error: "not found" }, 404); // 存在を漏らさない。
    }
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

  // 牌譜の修正を保存（所有者のみ）。body は Kifu JSON。
  app.put("/kifu/:id", requireAuth, async (c) => {
    // body は { kifu, status? }。旧クライアント互換で「body 自体が Kifu」も受ける。
    const body = (await c.req.json().catch(() => null)) as {
      kifu?: unknown;
      status?: unknown;
    } | null;
    const hasWrap = !!body && typeof body === "object" && "kifu" in body;
    const parsed = parseKifu(hasWrap ? body.kifu : body);
    if (!parsed.ok) return c.json({ ok: false, errors: parsed.errors }, 400);
    const status =
      body?.status === "draft" || body?.status === "complete" ? body.status : undefined;
    const result = await c.get("container").updateKifu.execute({
      userId: c.get("userId")!,
      logId: c.req.param("id"),
      kifu: parsed.kifu,
      status,
    });
    if (!result.ok) {
      if (result.reason === "not_found") return c.json({ error: "not found" }, 404);
      return c.json({ ok: false, reason: result.reason }, reasonStatus(result.reason));
    }
    return c.json({ ok: true });
  });

  // ユーザーの牌譜一覧。public は誰でも、private は本人にだけ見せる。
  app.get("/users/:id/kifu", async (c) => {
    const logs = await c.get("container").listKifu.execute(c.req.param("id"));
    const viewer = c.get("userId");
    const visible = logs.filter((l) => l.visibility === "public" || l.userId === viewer);
    return c.json(visible);
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

    const hands: Partial<Record<(typeof CameraSeatSchema.options)[number], ImageRef>> = {};
    for (const cam of CameraSeatSchema.options) {
      const f = asFile(form?.get(`hand_${cam}`));
      if (f) hands[cam] = await toImageRef(f);
    }

    const input: AnalysisInput = {
      riverImage: await toImageRef(river),
      hands,
      cameraBottomSeat: seat.data,
    };
    const gameIdRaw = form?.get("gameId");
    const gameId = typeof gameIdRaw === "string" && gameIdRaw ? gameIdRaw : undefined;

    try {
      const result = await c.get("container").analyzeAndSaveKifu.execute({ userId, input, gameId });
      if (!result.ok) {
        return c.json({ ok: false, reason: result.reason }, reasonStatus(result.reason));
      }
      return c.json({ ok: true, gameId: result.gameId, logId: result.gameLog.id }, 201);
    } catch {
      return c.json({ ok: false, error: "解析に失敗しました" }, 502);
    }
  });
}
