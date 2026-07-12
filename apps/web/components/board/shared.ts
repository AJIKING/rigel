import { type Seat } from "@rigel/schema";
import { signedPoints, type TileLocation } from "@rigel/ui";

/** 盤面エディタの牌ピッカーが「今どこを編集しているか」を表す選択状態。 */
export type Selection =
  | { kind: "edit"; loc: TileLocation }
  | { kind: "add"; seat: Seat; area: "hand" | "river" }
  // ドラ/裏ドラは複数枚（カンで増える）。index あり=その1枚を変更、無し=追加。
  | { kind: "dora"; index?: number }
  | { kind: "uradora"; index?: number }
  | null;

/** TileLocation を一意なキー文字列に。選択中/フラッシュ中の牌の一致判定に使う。 */
export function fkey(loc: TileLocation): string {
  return `${loc.seat}:${loc.area}:${loc.meldIndex ?? "-"}:${loc.index}`;
}

/** ポイント入力（文字列）の符号つきフォーマット。整形は共有の signedPoints に委ねる。 */
export function fmtPts(v: string): string {
  return signedPoints(parseFloat(v));
}
