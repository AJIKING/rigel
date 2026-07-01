// 局跨ぎの点棒集計。各局の和了(agari)から点棒移動を出し、開始点に積んで持ち点を求める。
// 和了の打点は kifuScore（＝各局の kifu.rules）に従う。本場は 300/局(ロン)・100×3(ツモ)、
// 供託は和了者が総取り。流局の細かい精算（テンパイ料）は未対応。

import type { Agari, Kifu, Rules, Seat } from "@rigel/schema";
import { scoreAgari } from "./score";

export type SeatDeltas = Record<Seat, number>;

const SEATS: Seat[] = ["east", "south", "west", "north"];
const zero = (): SeatDeltas => ({ east: 0, south: 0, west: 0, north: 0 });

/** 和了1件ぶんの点棒移動を d に加える（本場込み）。供託は呼び出し側で先頭のみ加算。 */
function applyAgari(d: SeatDeltas, a: Agari, kifu: Kifu): void {
  const p = scoreAgari(a, kifu.meta.dealer, kifu.rules).payment;
  const honba = kifu.meta.honba;
  const pay = (base: number, tsumoShare: boolean) => base + honba * (tsumoShare ? 100 : 300);

  if ("ron" in p) {
    if (a.from) {
      const amount = pay(p.ron, false);
      d[a.from] -= amount;
      d[a.winner] += amount;
    }
  } else if ("each" in p) {
    // 親ツモ: 全員が同額。
    for (const s of SEATS) {
      if (s === a.winner) continue;
      const amount = pay(p.each, true);
      d[s] -= amount;
      d[a.winner] += amount;
    }
  } else {
    // 子ツモ: 親と子で異なる。
    const dealer = kifu.meta.dealer ?? "east";
    for (const s of SEATS) {
      if (s === a.winner) continue;
      const amount = pay(s === dealer ? p.fromDealer : p.fromNonDealer, true);
      d[s] -= amount;
      d[a.winner] += amount;
    }
  }
}

/** 1局の点棒移動（本場・供託込み）。和了が無ければ全員0。ダブロン等は各和了を合算。
 *  供託は先頭の和了者（頭ハネ/上家取り）が総取りする。 */
export function agariDeltas(kifu: Kifu): SeatDeltas {
  const d = zero();
  kifu.agari.forEach((a) => applyAgari(d, a, kifu));
  const head = kifu.agari[0];
  if (head) d[head.winner] += kifu.meta.kyotaku * 1000;
  return d;
}

/** 開始点（rules.start）から各局の増減を積んだ持ち点。 */
export function standings(kifus: Kifu[], rules: Rules): SeatDeltas {
  const start = Number(rules.start);
  const total: SeatDeltas = { east: start, south: start, west: start, north: start };
  for (const kifu of kifus) {
    const d = agariDeltas(kifu);
    for (const s of SEATS) total[s] += d[s];
  }
  return total;
}
