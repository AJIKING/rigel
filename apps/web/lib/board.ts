// 盤面まわりの共有ヘルパ（盤面エディタ・閲覧ビューアで共通）。
// 席の自風・局名・河の巡送りなどのプラットフォーム非依存ロジックは @rigel/ui に集約し、
// ここからは再エクスポートする（web/mobile 両ビューアで同一挙動を保つ）。

import { toAbsoluteSeat, type CameraSeat, type Kifu, type Seat, type Tile } from "@rigel/schema";
import { SEAT_ORDER, sortHandTiles, type TileLocation } from "@rigel/ui";

export {
  SEAT_ORDER,
  sortHandTiles,
  hasPlayerPoints,
  windOf,
  roundName,
  roundHonbaLabel,
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

/** 絶対席をカメラ相対（手前基準）へ戻す。toAbsoluteSeat の逆写像で、
 *  追加ピッカーの「鳴いた人」の既定値に使う。 */
export function cameraSeatOf(seat: Seat, bottomSeat: Seat): CameraSeat {
  return CAMS.find((cam) => toAbsoluteSeat(cam, bottomSeat) === seat) ?? "bottom";
}

/** 下家（次の打牌席）。捨て牌から鳴きを作るときの鳴き主の既定に使う。 */
export function shimochaOf(seat: Seat): Seat {
  return SEAT_ORDER[(SEAT_ORDER.indexOf(seat) + 1) % 4]!;
}

/** 手牌修正後のフラッシュ位置。理牌で牌が動くので、applyTileEdit と同じ安定ソートを
 *  元 index 付きで再現して「動いた先」を求める。 */
export function handIndexAfterEdit(kifu: Kifu, loc: TileLocation, code: Tile): number {
  const edited = kifu.seats[loc.seat].hand.map((t, i) => ({
    tile: i === loc.index ? code : t.tile,
    i,
  }));
  return sortHandTiles(edited).findIndex((t) => t.i === loc.index);
}
