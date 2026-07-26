// テンパイ・和了形の判定（何切るのリーチ可否判定に使う。web/mobile 共有）。
// 対象は門前部分の「形」のみ（役の有無・フリテン・点棒・残り牌山は見ない）。
// 将来 API 側の回答検証（schema の isValidAnswer）にも riichi 妥当性を載せる場合は、
// 形判定のコア（isWinningShape/isTenpaiShape）を @rigel/schema へ移して共有する。

import type { Problem, Tile } from "@rigel/schema";
import { CANDIDATE_TILES, KOKUSHI, toCounts } from "./tile-counts";

// counts 基盤（牌種インデックス・toCounts・KOKUSHI・候補34種）は tile-counts.ts に一元化。
// 既存の import 面（@rigel/ui / "./tenpai" からの toCounts・KOKUSHI）は re-export で維持する。
export { KOKUSHI, toCounts } from "./tile-counts";

/** counts を刻子・順子だけで使い切れるか（雀頭は除去済みの前提）。 */
function decomposeSets(c: number[], i: number): boolean {
  while (i < 34 && c[i] === 0) i++;
  if (i === 34) return true;
  if (c[i] >= 3) {
    c[i] -= 3;
    const ok = decomposeSets(c, i);
    c[i] += 3;
    if (ok) return true;
  }
  // 順子は数牌のみ（スート境界 7,8,9 番目からは作れない）。
  if (i < 27 && i % 9 <= 6 && c[i + 1] > 0 && c[i + 2] > 0) {
    c[i]--;
    c[i + 1]--;
    c[i + 2]--;
    const ok = decomposeSets(c, i);
    c[i]++;
    c[i + 1]++;
    c[i + 2]++;
    if (ok) return true;
  }
  return false;
}

/** counts（34種の枚数・総枚数 total）が和了形か。isTenpaiShape が counts を
 *  増減しながら34種を試すため、counts ベースを中核にする（判定中は破壊しない）。 */
function isWinningCounts(counts: number[], total: number): boolean {
  if (total % 3 !== 2) return false;
  if (total === 14) {
    if (counts.every((n) => n === 0 || n === 2)) return true; // 七対子（同種4枚は不可）
    if (KOKUSHI.every((i) => counts[i] >= 1) && KOKUSHI.some((i) => counts[i] === 2)) return true; // 国士無双
  }
  // 通常形: 雀頭を全候補で試し、残りが面子で割り切れるか。
  for (let p = 0; p < 34; p++) {
    if (counts[p] < 2) continue;
    counts[p] -= 2;
    const ok = decomposeSets(counts, 0);
    counts[p] += 2;
    if (ok) return true;
  }
  return false;
}

/**
 * 門前部分（3n+2枚）が和了形か。通常形（n面子1雀頭）に加え、
 * 14枚のときのみ七対子・国士無双も見る（副露があると成立しないため）。
 */
export function isWinningShape(tiles: readonly Tile[]): boolean {
  return isWinningCounts(toCounts(tiles), tiles.length);
}

/** 3n+1 枚の手の待ち牌（加えると和了形になる牌種）を TILE_VALUES 順で列挙する。
 *  読めない牌（null）を含む手・枚数不整合の手は判定しない（空配列）。 */
export function winningTiles(tiles: readonly (Tile | null)[]): Tile[] {
  if (tiles.some((t) => t === null)) return [];
  const real = tiles as readonly Tile[];
  if (real.length % 3 !== 1) return [];
  const counts = toCounts(real);
  const waits: Tile[] = [];
  for (let i = 0; i < 34; i++) {
    if (counts[i] >= 4) continue; // 5枚目は存在しない
    counts[i]++;
    const ok = isWinningCounts(counts, real.length + 1);
    counts[i]--;
    if (ok) waits.push(CANDIDATE_TILES[i]);
  }
  return waits;
}

/** 門前部分（3n+1枚）がテンパイか（いずれか1種を足すと和了形になる）。
 *  読めない牌（null）を含む手は判定しない（false）。 */
export function isTenpaiShape(tiles: readonly (Tile | null)[]): boolean {
  return winningTiles(tiles).length > 0;
}

/**
 * 何切る: 選んだ牌を切ったあとリーチできるか。
 * 判定は「discard 問題＋門前（副露は暗槓のみ許容）＋切った後の手牌がテンパイ」。
 * 未選択（null）・読めない牌を含む手・枚数不整合は false（判定できない手は宣言させない）。
 */
export function canRiichiAfterDiscard(
  problem: Problem,
  picked: { tile: Tile; drawn: boolean } | null,
): boolean {
  if (problem.kind !== "discard" || picked === null) return false;
  const board = problem.seats[problem.pov];
  if (board.melds.some((m) => m.type !== "kan_closed")) return false; // 門前限定
  const tiles: (Tile | null)[] = board.hand.map((t) => t.tile);
  if (problem.drawn) tiles.push(problem.drawn);
  const i = tiles.indexOf(picked.tile);
  if (i < 0) return false;
  tiles.splice(i, 1);
  return isTenpaiShape(tiles); // null 牌の除外は isTenpaiShape が一元的に担う
}
