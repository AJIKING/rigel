// @rigel/ui — 盤面表示の共有ヘルパ（プラットフォーム非依存）。
// web/mobile 両ビューアが同じ「席の自風・局名・河の巡送り」ロジックを共有する。

import type { Agari, Kifu, Seat } from "@rigel/schema";
import { deriveTimeline } from "./timeline";

/** 局結果コード（スキーマの ResultSchema と一致。型が未エクスポートのためここで定義）。 */
export type KifuResult = "ron" | "tsumo" | "draw";

/** 絶対席の座順（下家方向）。 */
export const SEAT_ORDER: Seat[] = ["east", "south", "west", "north"];

const WINDS = ["東", "南", "西", "北"];
const KANJI = ["一", "二", "三", "四"];

/** 親(dealer)を基準にした各席の自風（東/南/西/北）。 */
export function windOf(seat: Seat, dealer: Seat): string {
  return WINDS[(SEAT_ORDER.indexOf(seat) - SEAT_ORDER.indexOf(dealer) + 4) % 4]!;
}

/** 局のインデックス(0始まり)を「東一局」などの表示名に。 */
export function roundName(index: number): string {
  return `${WINDS[Math.min(Math.floor(index / 4), 3)]}${KANJI[index % 4]}局`;
}

/**
 * 局順 seq(1始まり) から局名を出す。局名は配列位置ではなく牌譜の実際の局順から
 * 出すこと（公開ビューアは公開局のサブセットを受け取るため、位置基準だと誤ラベルになる）。
 */
export function roundNameForSeq(seq: number): string {
  return roundName(Math.max(0, seq - 1));
}

/** 局結果コードの日本語ラベル（未設定は —）。web/mobile のビューアで共用。 */
export function resultLabel(result: KifuResult | null | undefined): string {
  return result === "ron" ? "ロン" : result === "tsumo" ? "ツモ" : result === "draw" ? "流局" : "—";
}

/** 席のネームプレートに出す結果（和了→ロン/ツモ、放銃→放銃、無関係→空）。agari が単一の真実源。 */
export function seatResult(agari: Agari[], seat: Seat): "ロン" | "ツモ" | "放銃" | "" {
  const won = agari.find((a) => a.winner === seat);
  if (won) return won.from ? "ロン" : "ツモ";
  if (agari.some((a) => a.from === seat)) return "放銃";
  return "";
}

/** 配列を n 個ずつに分割。 */
export function chunk<T>(a: T[], n: number): T[][] {
  const r: T[][] = [];
  for (let i = 0; i < a.length; i += n) r.push(a.slice(i, i + n));
  return r;
}

export interface RiverPlayback {
  /** 打牌の擬似ターン順（親起点の輪番を河の枚数ぶん回したもの）。 */
  order: Seat[];
  /** 各巡目の開始位置（1始まり。親の打牌ごとに区切る）。「次/前の巡目」ジャンプに使う。 */
  junmeStops: number[];
  /** 最大巡目（席の河の最長枚数）。 */
  maxTurn: number;
}

/**
 * 河の打牌順を親起点の輪番仮定で復元する（timeline を持たない移行データでも動く簡易版）。
 * 東→南→西→北 を親から回し、その巡にその席の打牌があれば並べる。
 */
export function buildRiverPlayback(kifu: Kifu, dealer: Seat): RiverPlayback {
  if (kifu.timeline.length > 0) {
    const order = deriveTimeline(kifu).flatMap((e) => (e.kind === "discard" ? [e.seat] : []));
    const counts: Record<Seat, number> = { east: 0, south: 0, west: 0, north: 0 };
    for (const seat of order) counts[seat]++;
    const maxTurn = Math.max(0, ...SEAT_ORDER.map((p) => counts[p]));
    const junmeStops = order.map((p, i) => (p === dealer ? i + 1 : -1)).filter((x) => x >= 0);
    return { order, junmeStops, maxTurn };
  }

  const windSeq = Array.from(
    { length: 4 },
    (_, i) => SEAT_ORDER[(SEAT_ORDER.indexOf(dealer) + i) % 4]!,
  );
  const maxTurn = Math.max(0, ...SEAT_ORDER.map((p) => kifu.seats[p].river.length));
  const order: Seat[] = [];
  for (let t = 0; t < maxTurn; t++) {
    for (const p of windSeq) if (t < kifu.seats[p].river.length) order.push(p);
  }
  const junmeStops = order.map((p, i) => (p === dealer ? i + 1 : -1)).filter((x) => x >= 0);
  return { order, junmeStops, maxTurn };
}

/** order を shown 手ぶん進めたときの、各席の見えている河の枚数。 */
export function revealCounts(order: Seat[], shown: number): Record<Seat, number> {
  const c: Record<Seat, number> = { east: 0, south: 0, west: 0, north: 0 };
  for (let i = 0; i < shown && i < order.length; i++) c[order[i]!]++;
  return c;
}
