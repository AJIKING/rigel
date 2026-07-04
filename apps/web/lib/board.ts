// 盤面まわりの共有ヘルパ（盤面エディタ・閲覧ビューアで共通）。
// 席の自風・局名・河の巡送りなどのプラットフォーム非依存ロジックは @rigel/ui に集約し、
// ここからは再エクスポートする（web/mobile 両ビューアで同一挙動を保つ）。

import type { CameraSeat } from "@rigel/schema";

export {
  SEAT_ORDER,
  windOf,
  roundName,
  roundNameForSeq,
  chunk,
  buildRiverPlayback,
  revealCounts,
  meldTiles,
  SUITS,
  NUMS,
  type PickerSuit as Suit,
  type RiverPlayback,
} from "@rigel/ui";

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
