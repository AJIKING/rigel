// テスト用フィクスチャ（本番バンドルには含まれない: production コードから import されない）。

import { KifuSchema, type Kifu } from "@rigel/schema";

/** 最小の有効な牌譜JSON。各席は空盤面のデフォルトへ展開される（検証前の生入力）。 */
export const minimalKifuInput = {
  schemaVersion: "1.0.0",
  capturedAt: "2026-06-28T00:00:00.000Z",
  seats: { east: {}, south: {}, west: {}, north: {} },
} as const;

/** 検証済みの最小牌譜。 */
export const validKifu: Kifu = KifuSchema.parse(minimalKifuInput);
