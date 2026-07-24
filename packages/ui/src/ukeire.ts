// 受け入れ計算（特訓クイズ「牌効率」の採点基盤。web/mobile 共有）。
// shanten.ts / tenpai.ts と同じ counts（34種・赤5正規化）を土台に、
// 3n+2 枚の手について打牌ごとの受け入れ（種類×残り枚数）を返す。
// 残り枚数は「4 − 自分の手牌内の使用枚数」のみ（場況＝河・副露の控除は v1 では見ない）。

import { TILE_VALUES, type Tile } from "@rigel/schema";
import { shanten } from "./shanten";
import { toCounts } from "./tenpai";

export interface DiscardUkeire {
  /** 切る牌（手牌の実コード。赤5は 0x のまま）。 */
  discard: Tile;
  /** 切った後の向聴数。 */
  shanten: number;
  /** 受け入れ牌（向聴が進む牌種。赤抜き34種・TILE_VALUES 順）。 */
  tiles: Tile[];
  /** 受け入れ枚数（Σ 4 − 自分の手牌内の使用枚数。赤5は5と同一視して数える）。 */
  count: number;
}

/** 受け入れ候補34種（TILE_VALUES 順・赤抜き）。tenpai.ts の tileIndex と並びが一致する。 */
const CANDIDATE_TILES: readonly Tile[] = TILE_VALUES.filter((t) => t[0] !== "0");

/** 牌コードの表示順（同率打牌の並び・bestDiscards の順序に使う）。 */
function tileOrder(tile: Tile): number {
  return TILE_VALUES.indexOf(tile);
}

/**
 * 3n+2 枚の手について、重複を除いた各打牌の受け入れを返す。
 * 受け入れ = 切った後の 3n+1 枚に加えると向聴数が1つ進む牌種（34種総当たり。0x は候補にしない）。
 * 0m と 5m は別の打牌候補として両方返す（正規化すれば同じ手なので効率は同値になる）。
 * 並びは「向聴数が小さい順 → count が大きい順 → 牌コード順」。
 * 副露がある手は meldCount（省略時 0）で部分手として評価し、
 * 手牌枚数 + 3×meldCount が 14 にならない手は判定できないので空配列を返す。
 */
export function discardUkeires(tiles: readonly Tile[], meldCount = 0): DiscardUkeire[] {
  if (!Number.isInteger(meldCount) || meldCount < 0) return [];
  if (tiles.length + meldCount * 3 !== 14) return [];
  const out: DiscardUkeire[] = [];
  const seen = new Set<Tile>();
  for (let i = 0; i < tiles.length; i++) {
    const discard = tiles[i]!;
    if (seen.has(discard)) continue;
    seen.add(discard);
    const rest = tiles.filter((_, j) => j !== i);
    const after = shanten(rest, meldCount);
    const counts = toCounts(rest);
    const accepted: Tile[] = [];
    let count = 0;
    for (let k = 0; k < 34; k++) {
      if (counts[k]! >= 4) continue; // 5枚目は存在しない
      if (shanten([...rest, CANDIDATE_TILES[k]!], meldCount) === after - 1) {
        accepted.push(CANDIDATE_TILES[k]!);
        count += 4 - counts[k]!;
      }
    }
    out.push({ discard, shanten: after, tiles: accepted, count });
  }
  return out.sort(
    (a, b) =>
      a.shanten - b.shanten || b.count - a.count || tileOrder(a.discard) - tileOrder(b.discard),
  );
}

/**
 * 正解集合 = 「まず最小向聴を保つ」打牌のうち受け入れ枚数が最大のもの（同率は全部）。
 * 向聴戻しの打牌は受け入れが多くても正解に入らない。並びは discardUkeires と同じ（牌コード順）。
 */
export function bestDiscards(tiles: readonly Tile[], meldCount = 0): Tile[] {
  const all = discardUkeires(tiles, meldCount);
  const best = all[0];
  if (!best) return [];
  return all
    .filter((u) => u.shanten === best.shanten && u.count === best.count)
    .map((u) => u.discard);
}
