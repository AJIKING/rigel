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

// ============================================================
// 描画用の「面仕様」（プラットフォーム非依存）
// ------------------------------------------------------------
// 牌の見た目は「SVG自前・簡易フェイス」方式。web=<svg> / mobile=react-native-svg が
// この tileFace() の戻り値だけを見て描く（描画コードは各アプリ）。
// 詳細: docs/開発ガイド/06_牌のデザイン.md
// ============================================================

/** スートの基準字色（数牌）。赤ドラは RED_TILE_COLOR を優先。 */
export const SUIT_COLOR: Record<Suit, string> = {
  m: "#9b1c1c", // 萬子=赤茶
  p: "#0b5cad", // 筒子=青
  s: "#1b7a2f", // 索子=緑
  z: "#222222", // 字牌=黒
};
export const RED_TILE_COLOR = "#e60026";
/** 要確認（confidence 低 / 読み取り失敗）の強調色。 */
export const REVIEW_COLOR = "#d10f3a";

export type TileKind = "number" | "honor" | "unknown";

export interface TileFace {
  kind: TileKind;
  /** 数牌は 1..9（赤は5）。字牌/不明は undefined。 */
  rank?: number;
  suit?: Suit;
  red: boolean;
  /** メイン表示文字。数牌=スート記号(萬/筒/索)、字牌=東..中、不明=?。 */
  glyph: string;
  /** 字色。 */
  color: string;
}

/** 牌コードを描画用の面仕様へ変換する。各プラットフォームはこの仕様だけ見て描く。 */
export function tileFace(tile: Tile | null): TileFace {
  const info = describeTile(tile);
  if (!info) {
    return { kind: "unknown", red: false, glyph: "?", color: "#aaaaaa" };
  }
  if (info.suit === "z") {
    return {
      kind: "honor",
      rank: info.rank,
      red: false,
      glyph: HONOR_LABELS[info.rank - 1] ?? "?",
      color: SUIT_COLOR.z,
    };
  }
  return {
    kind: "number",
    rank: info.rank,
    suit: info.suit,
    red: info.red,
    glyph: SUIT_MARK[info.suit],
    color: info.red ? RED_TILE_COLOR : SUIT_COLOR[info.suit],
  };
}
