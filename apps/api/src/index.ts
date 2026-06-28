// ============================================================
// apps/api — Cloudflare Workers（API 本体）
// ------------------------------------------------------------
// 現状は土台のみ。背骨(@rigel/schema)を全層が共有することのデモとして、
// 受け取った牌譜JSONを KifuSchema で検証するエンドポイントを置く。
// 解析パイプライン（4分割→Gemini→Zod→Kifu組み立て）は M5 で実装する。
// ============================================================

import { KifuSchema, type Kifu } from "@rigel/schema";

export type ParseKifuResult = { ok: true; kifu: Kifu } | { ok: false; errors: string[] };

/**
 * 任意の入力(JSON)を牌譜スキーマで検証する純粋関数。
 * AI 出力も保存前の牌譜も、下流で使う前に必ずここを通す（信頼ゲート）。
 */
export function parseKifu(body: unknown): ParseKifuResult {
  const result = KifuSchema.safeParse(body);
  if (result.success) return { ok: true, kifu: result.data };
  return {
    ok: false,
    errors: result.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`),
  };
}

export default {
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/health") {
      return Response.json({ ok: true });
    }

    // 牌譜の検証エンドポイント（保存は M7。撮影画像は保存しない方針）。
    if (url.pathname === "/kifu/validate" && request.method === "POST") {
      const body: unknown = await request.json().catch(() => null);
      const parsed = parseKifu(body);
      if (!parsed.ok) {
        return Response.json({ ok: false, errors: parsed.errors }, { status: 400 });
      }
      return Response.json({ ok: true });
    }

    return new Response("not found", { status: 404 });
  },
};
