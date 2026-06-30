// 盤面まわりの共有ヘルパ（盤面エディタ・閲覧ビューアで共通）。

import type { CameraSeat, Seat, Tile } from "@rigel/schema";

/** 牌ピッカーの牌種（萬/筒/索/字）。 */
export type Suit = "m" | "p" | "s" | "z";
export const SUITS: { suit: Suit; label: string }[] = [
  { suit: "m", label: "萬" },
  { suit: "p", label: "筒" },
  { suit: "s", label: "索" },
  { suit: "z", label: "字" },
];
/** 牌種ごとの選択候補（末尾の 0x は赤ドラ）。 */
export const NUMS: Record<Suit, Tile[]> = {
  m: ["1m", "2m", "3m", "4m", "5m", "6m", "7m", "8m", "9m", "0m"],
  p: ["1p", "2p", "3p", "4p", "5p", "6p", "7p", "8p", "9p", "0p"],
  s: ["1s", "2s", "3s", "4s", "5s", "6s", "7s", "8s", "9s", "0s"],
  z: ["1z", "2z", "3z", "4z", "5z", "6z", "7z"],
};

/** 絶対席の座順（下家方向）。 */
export const SEAT_ORDER: Seat[] = ["east", "south", "west", "north"];
/** 画面スロット = カメラ相対席（手前/右/向かい/上家）。 */
export const CAMS: CameraSeat[] = ["bottom", "right", "top", "left"];

const WINDS = ["東", "南", "西", "北"];
const KANJI = ["一", "二", "三", "四"];

/** 親(dealer)を基準にした各席の自風（東/南/西/北）。 */
export function windOf(seat: Seat, dealer: Seat): string {
  return WINDS[(SEAT_ORDER.indexOf(seat) - SEAT_ORDER.indexOf(dealer) + 4) % 4];
}

/** クリック元の矩形から、ビューポート内に収めた牌ピッカーの表示位置を返す。
 *  position:fixed 前提（overflow:hidden な祖先に切られないよう、盤面・モーダル共通で使う）。 */
export function popAnchor(r: DOMRect, pw = 236, ph = 320): { x: number; y: number } {
  let x = r.right + 8;
  if (x + pw > window.innerWidth - 8) x = r.left - pw - 8;
  x = Math.max(8, Math.min(x, window.innerWidth - pw - 8));
  const y = Math.max(8, Math.min(r.top + r.height / 2 - ph / 2, window.innerHeight - ph - 8));
  return { x, y };
}

/** 配列を n 個ずつに分割。 */
export function chunk<T>(a: T[], n: number): T[][] {
  const r: T[][] = [];
  for (let i = 0; i < a.length; i += n) r.push(a.slice(i, i + n));
  return r;
}

/** 局のインデックス(0始まり)を「東一局」などの表示名に。 */
export function roundName(index: number): string {
  return `${WINDS[Math.min(Math.floor(index / 4), 3)]}${KANJI[index % 4]}局`;
}
