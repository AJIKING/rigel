import { type Kifu, type Seat } from "@rigel/schema";
import { type TileLocation } from "@rigel/ui";

/** 盤面エディタの牌ピッカーが「今どこを編集しているか」を表す選択状態。 */
export type Selection =
  | { kind: "edit"; loc: TileLocation }
  | { kind: "add"; seat: Seat; area: "hand" | "river" }
  | { kind: "dora" }
  | { kind: "uradora" }
  | null;

/** TileLocation を一意なキー文字列に。選択中/フラッシュ中の牌の一致判定に使う。 */
export function fkey(loc: TileLocation): string {
  return `${loc.seat}:${loc.area}:${loc.meldIndex ?? "-"}:${loc.index}`;
}

/** Kifu のディープコピー（不変更新の起点）。 */
export function clone(k: Kifu): Kifu {
  return JSON.parse(JSON.stringify(k)) as Kifu;
}

/** ポイント表示用の符号つきフォーマット（"+12.3" / "-4.0" / 不正値は "0.0"）。 */
export function fmtPts(v: string): string {
  const n = parseFloat(v);
  if (isNaN(n)) return "0.0";
  return (n >= 0 ? "+" : "") + n.toFixed(1);
}
