// 盤面まわりの共有ヘルパ（盤面エディタ・閲覧ビューアで共通）。
// 席の自風・局名・河の巡送りなどのプラットフォーム非依存ロジックは @rigel/ui に集約し、
// ここからは再エクスポートする（web/mobile 両ビューアで同一挙動を保つ）。

import type { CameraSeat, Tile } from "@rigel/schema";

export {
  SEAT_ORDER,
  windOf,
  roundName,
  roundNameForSeq,
  chunk,
  buildRiverPlayback,
  revealCounts,
  type RiverPlayback,
} from "@rigel/ui";

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

/** 画面スロット = カメラ相対席（手前/右/向かい/上家）。 */
export const CAMS: CameraSeat[] = ["bottom", "right", "top", "left"];

/** クリック元の矩形から、ビューポート内に収めた牌ピッカーの表示位置を返す。
 *  position:fixed 前提（overflow:hidden な祖先に切られないよう、盤面・モーダル共通で使う）。 */
export function popAnchor(r: DOMRect, pw = 236, ph = 320): { x: number; y: number } {
  let x = r.right + 8;
  if (x + pw > window.innerWidth - 8) x = r.left - pw - 8;
  x = Math.max(8, Math.min(x, window.innerWidth - pw - 8));
  const y = Math.max(8, Math.min(r.top + r.height / 2 - ph / 2, window.innerHeight - ph - 8));
  return { x, y };
}

/** 鳴き牌の並びを作る。ポン=同牌3枚、カン=同牌4枚、チー=選択牌を含む3連続（両端は1-9に収める）。
 *  字牌など連続を作れない牌でチーが指定された場合は同種3枚にフォールバックする。 */
export function meldTiles(type: "chi" | "pon" | "kan", code: Tile): Tile[] {
  if (type === "pon") return [code, code, code];
  if (type === "kan") return [code, code, code, code];
  const su = code[1];
  if (su !== "m" && su !== "p" && su !== "s") return [code, code, code];
  const n = code[0] === "0" ? 5 : Number(code[0]);
  const st = Math.max(1, Math.min(n - 1, 7));
  return [`${st}${su}` as Tile, `${st + 1}${su}` as Tile, `${st + 2}${su}` as Tile];
}
