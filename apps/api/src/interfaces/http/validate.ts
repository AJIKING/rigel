// interfaces/http — 入力検証ヘルパ。
// 受け取った JSON を背骨スキーマ(KifuSchema)で検証する。下流で使う前に必ず通す。

import { KifuSchema, type Kifu } from "@rigel/schema";

export type ParseKifuResult = { ok: true; kifu: Kifu } | { ok: false; errors: string[] };

export function parseKifu(body: unknown): ParseKifuResult {
  const result = KifuSchema.safeParse(body);
  if (result.success) return { ok: true, kifu: result.data };
  return {
    ok: false,
    errors: result.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`),
  };
}
