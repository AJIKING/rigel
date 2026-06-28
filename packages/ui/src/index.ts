// ============================================================
// @rigel/ui — 牌・盤面の表示ロジック（プラットフォーム非依存の純粋関数）
// ------------------------------------------------------------
// 描画コンポーネント本体は各アプリ側（web=Next.js / mobile=RN）に置く。
// UI共有手段は [未確定]（Tamagui / RN Web / 自前SVG）なので、ここでは
// 「どう見せるか」の純粋ロジックだけを共有する。
// ============================================================

import type { ReadTile, Seat, Tile } from "@rigel/schema";

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

export type Suit = "m" | "p" | "s" | "z";

export interface TileInfo {
  suit: Suit;
  /** 数牌は 1..9、字牌は 1..7（東南西北白發中）。赤ドラ(0m/0p/0s)は rank=5。 */
  rank: number;
  red: boolean;
}

/** 天鳳式の牌コードを描画しやすい形に分解する。null は null。 */
export function describeTile(tile: Tile | null): TileInfo | null {
  if (tile === null) return null;
  const n = Number(tile[0]);
  const suit = tile[1] as Suit;
  const red = n === 0;
  return { suit, rank: red ? 5 : n, red };
}

const SUIT_MARK: Record<Suit, string> = { m: "萬", p: "筒", s: "索", z: "字" };
const HONOR_LABELS = ["東", "南", "西", "北", "白", "發", "中"]; // 1z..7z

/** 牌の人間向けラベル（例: "1m"→"1萬", "0p"→"赤5筒", "1z"→"東", null→"?"）。 */
export function tileLabel(tile: Tile | null): string {
  const info = describeTile(tile);
  if (!info) return "?";
  if (info.suit === "z") return HONOR_LABELS[info.rank - 1] ?? "?";
  return `${info.red ? "赤" : ""}${info.rank}${SUIT_MARK[info.suit]}`;
}

const SEAT_LABELS: Record<Seat, string> = { east: "東", south: "南", west: "西", north: "北" };

/** 席の日本語ラベル。 */
export function seatLabel(seat: Seat): string {
  return SEAT_LABELS[seat];
}
