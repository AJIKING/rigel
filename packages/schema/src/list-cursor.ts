// ============================================================
// 一覧ページングのカーソル（背骨）
// ------------------------------------------------------------
// 全一覧 API が同じカーソル形を共有する（Plan: docs/plans/list-pagination.md 3-1）。
// 形は不透明文字列 "<epochMs>_<id>"。並びは基準時刻 DESC・同時刻は id DESC の
// タイブレークで、クエリは (t < ms) OR (t = ms AND id < id) を適用する。
// offset を使わない理由: D1(SQLite) の深い OFFSET は走査コストが線形で、
// 行の挿入によりページ間で重複/欠落が起きるため。
// ============================================================

import { z } from "zod";

/** カーソルの中身（基準時刻 epoch ms＋タイブレーク id）。 */
export interface ListCursor {
  ms: number;
  id: string;
}

// id の上限80: uuid(36) や favorites の複合キー "problem:<uuid>"(44) に余裕を持たせつつ、
// 異常入力（無限長）を弾く。
const ListCursorSchema = z.object({
  ms: z.number().int().positive(),
  id: z.string().min(1).max(80),
});

/** カーソルを wire 用の不透明文字列にする。 */
export function encodeListCursor(cursor: ListCursor): string {
  return `${cursor.ms}_${cursor.id}`;
}

/** wire のカーソル文字列を検証つきで戻す。不正は null（呼び出し側が invalid=400 に落とす）。
 *  id 側にアンダースコアが含まれてもよいよう、先頭の区切りだけを使う。 */
export function decodeListCursor(raw: string): ListCursor | null {
  const sep = raw.indexOf("_");
  if (sep <= 0) return null;
  const head = raw.slice(0, sep);
  // Number("") や "1.5"・指数表記などを Zod の int 検証で弾く（先に数値化だけする）。
  if (!/^\d+$/.test(head)) return null;
  const parsed = ListCursorSchema.safeParse({ ms: Number(head), id: raw.slice(sep + 1) });
  return parsed.success ? parsed.data : null;
}
