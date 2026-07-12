// 局跨ぎの点棒集計。各局の点棒移動（和了・本場・供託・リーチ棒・流局のノーテン罰符）を
// 開始点に積んで持ち点を求める。和了の打点は scoreAgari（＝各局の kifu.rules）に従う。
// 本場は 300/局(ロン)・100×3(ツモ)、供託・卓上のリーチ棒は和了者（頭ハネ）が総取り。
// 流局時のリーチ棒は戻らない（次局の meta.kyotaku へ持ち越される想定）。

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

/** 流局の不聴罰符（テンパイ料）による点棒移動。聴牌者の合計 +3000 を分け、
 *  不聴者が合計 3000 を分けて払う。全員聴牌/全員不聴（0 or 4 人）は移動なし。 */
export function notenDeltas(tenpai: Seat[]): SeatDeltas {
  const d = zero();
  const set = new Set(tenpai);
  const n = set.size;
  if (n === 0 || n === 4) return d;
  const gain = 3000 / n; // 聴牌者1人あたりの受取
  const pay = 3000 / (4 - n); // 不聴者1人あたりの支払い
  for (const s of SEATS) d[s] = set.has(s) ? gain : -pay;
  return d;
}

/**
 * 1局の点棒移動の合計。和了の移動（agariDeltas）に加えて、
 * リーチ宣言棒（宣言者 -1000・和了があれば頭ハネの和了者が総取り）と、
 * 流局時のノーテン罰符（rules.noten 有効時）を精算する。
 */
export function kyokuDeltas(kifu: Kifu): SeatDeltas {
  const d = agariDeltas(kifu);
  // リーチ宣言は河の宣言牌（riichi:true）から拾う（和了・流局どちらでも -1000）。
  // スナップショット（timeline 無し）でも判定できる代わりに、宣言牌が鳴かれて河から
  // 消え、次の打牌（横向きの引き継ぎ）前に局が終わった稀な盤面は取りこぼす＝許容。
  const declared = SEATS.filter((s) => kifu.seats[s].river.some((t) => t.riichi));
  for (const s of declared) d[s] -= 1000;
  const head = kifu.agari[0];
  if (head) {
    d[head.winner] += declared.length * 1000;
  } else if (kifu.result === "draw" && kifu.rules.noten) {
    const n = notenDeltas(kifu.tenpai);
    for (const s of SEATS) d[s] += n[s];
  }
  return d;
}

/** 開始点（rules.start）から各局の増減を積んだ持ち点。 */
export function standings(kifus: Kifu[], rules: Rules): SeatDeltas {
  const start = Number(rules.start);
  const total: SeatDeltas = { east: start, south: start, west: start, north: start };
  for (const kifu of kifus) {
    const d = kyokuDeltas(kifu);
    for (const s of SEATS) total[s] += d[s];
  }
  return total;
}
