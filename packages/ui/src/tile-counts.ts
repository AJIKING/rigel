// counts 基盤（牌種インデックス・34種の枚数配列・候補34種）。
// tenpai / shanten / ukeire / score-engine / quiz が共有する単一の土台。
// かつて tenpai.ts（SUIT_BASE/tileIndex/toCounts/KOKUSHI/CANDIDATE_TILES）・
// score-engine.ts（SUIT_BASE/tileIdx）・ukeire.ts（CANDIDATE_TILES）・quiz.ts（KINDS）に
// 重複定義があったものをここに一元化した（2026-07-26 リファクタ。挙動不変）。

import { TILE_VALUES, type Tile } from "@rigel/schema";

/** 牌種インデックスのスート基点: 0-8=萬 9-17=筒 18-26=索 27-33=字。 */
export const SUIT_BASE: Record<string, number> = { m: 0, p: 9, s: 18, z: 27 };

/** 牌 → 牌種インデックス（0-33）。赤5（0m/0p/0s）は通常の5に正規化。 */
export function tileIndex(tile: Tile): number {
  const n = tile[0] === "0" ? 5 : Number(tile[0]);
  return SUIT_BASE[tile[1]] + n - 1;
}

/** 手牌を34種の枚数配列へ（赤5は5に正規化）。 */
export function toCounts(tiles: readonly Tile[]): number[] {
  const c = new Array<number>(34).fill(0);
  for (const t of tiles) c[tileIndex(t)]++;
  return c;
}

/** 幺九牌（国士の構成牌）のインデックス。 */
export const KOKUSHI = [0, 8, 9, 17, 18, 26, 27, 28, 29, 30, 31, 32, 33];

/** 候補34種（TILE_VALUES 順・赤抜き。赤5は 5m/5p/5s で代表し 0x は含めない）。
 *  並びは tileIndex（0-8=萬 9-17=筒 18-26=索 27-33=字）と一致する。 */
export const CANDIDATE_TILES: readonly Tile[] = TILE_VALUES.filter((t) => t[0] !== "0");
