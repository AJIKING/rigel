// @rigel/ui — 盤面表示の共有ヘルパ（プラットフォーム非依存）。
// web/mobile 両ビューアが同じ「席の自風・局名・河の巡送り」ロジックを共有する。

import type { Agari, Kifu, Meld, MeldType, Players, Seat, Tile } from "@rigel/schema";
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

/** 親起点の席順（親→下家→対面→上家 = 東南西北の並びを dealer から回す）。 */
export function seatsFromDealer(dealer: Seat): Seat[] {
  const i = SEAT_ORDER.indexOf(dealer);
  return [0, 1, 2, 3].map((k) => SEAT_ORDER[(i + k) % 4]!);
}

/** 点数の表示（例 25000 → "25,000点"）。ネームプレート・平面ヘッダ・開始点で共用。 */
export function pointsLabel(points: number): string {
  return `${points.toLocaleString()}点`;
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

/** 局名＋本場の共通表記（例「東一局 1本場」）。局の一覧・メニューで連荘
 *  （同じ局順の局）を区別するために web/mobile で共用する。 */
export function roundHonbaLabel(seq: number, honba: number): string {
  return `${roundNameForSeq(seq)} ${honba}本場`;
}

/** 鳴き種別の表示名（手順タブ・鳴き一覧で共用。web/mobile の表記ゆれ防止）。 */
export const MELD_TYPE_LABELS: Record<MeldType, string> = {
  pon: "ポン",
  chi: "チー",
  kan_open: "大明槓",
  kan_closed: "暗槓",
  kan_added: "加槓",
};

/** 鳴き1面子の1牌ぶんの見た目（横向き・背面）。 */
export interface MeldTileView {
  tile: Tile | null;
  /** 鳴いた牌の横向き表示（位置で鳴き元を示す）。 */
  lay: boolean;
  /** 背面（暗槓の両端）。 */
  back: boolean;
}

/**
 * 鳴き1面子の表示列（web/mobile の盤面で共用）。実卓の作法に合わせる:
 *  - 暗槓: 両端2枚を背面にする（横向きなし）
 *  - それ以外: 鳴いた牌を横向きにし、位置で鳴き元を示す
 *    （上家から=左端・対面から=左から2枚目・下家から=右端。from 不明は左端＝従来互換）
 */
export function meldTileViews(meld: Meld, caller: Seat): MeldTileView[] {
  const n = meld.tiles.length;
  if (meld.type === "kan_closed") {
    return meld.tiles.map((t, i) => ({ tile: t.tile, lay: false, back: i === 0 || i === n - 1 }));
  }
  const rel = meld.from ? (SEAT_ORDER.indexOf(meld.from) - SEAT_ORDER.indexOf(caller) + 4) % 4 : 3; // from 不明は上家扱い（左端横向き＝従来表示の互換）
  const layIdx = rel === 1 ? n - 1 : rel === 2 ? 1 : 0; // 1=下家, 2=対面, 3=上家
  return meld.tiles.map((t, i) => ({ tile: t.tile, lay: i === layIdx, back: false }));
}

/** リーグ戦ポイントが1人でも記録されているか。全員 0.0 の選手情報は「まだ記録していない」
 *  とみなし、再生画面のポイント表示は既定で隠す（トグルで出せる）。web/mobile 共用。 */
export function hasPlayerPoints(players: Players | null | undefined): boolean {
  return !!players && SEAT_ORDER.some((s) => players[s].points !== 0);
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
