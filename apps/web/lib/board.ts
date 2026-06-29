// 盤面まわりの共有ヘルパ（盤面エディタ・閲覧ビューアで共通）。

import type { CameraSeat, Seat } from "@rigel/schema";

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
