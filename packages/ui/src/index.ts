// ============================================================
// @rigel/ui — 牌の SVG 描画・confidence ハイライト・修正UI（RN/Web 共有）
// ------------------------------------------------------------
// 描画コンポーネント本体は M6 で実装する（react-native-svg 想定）。
// 現状はワークスペースの土台として、confidence → 人手確認(HITL) の判定だけを置く。
// この判定はハーネスの「権限 / human-in-the-loop」に対応する（[01 ハーネス] 参照）。
// ============================================================

import type { ReadTile } from "@rigel/schema";

/** confidence がこの値未満なら UI で「要確認」ハイライトにする閾値（暫定。eval で調整する）。 */
export const REVIEW_CONFIDENCE_THRESHOLD = 0.8;

/**
 * 牌が人手確認を要するか。
 * 読めなかった牌(null) か、確信度が閾値未満なら true。
 * 「自信満々の誤読」を人に拾わせる入口なので、迷ったら確認側に倒す。
 */
export function needsReview(tile: ReadTile, threshold = REVIEW_CONFIDENCE_THRESHOLD): boolean {
  return tile.tile === null || tile.confidence < threshold;
}
