// application — 一覧ページングの共通ヘルパ（Plan: docs/plans/list-pagination.md）。
// リポジトリは「pageSize+1 件」を読み、ここで items と nextCursor に切り分ける
// （余りが有る=次ページ有り。カーソルの encode/decode は背骨 @rigel/schema）。

import { decodeListCursor, encodeListCursor, type ListCursor } from "@rigel/schema";

export interface PageResult<T> {
  items: T[];
  nextCursor: string | null;
}

/** カーソル付き一覧ユースケースの共通結果形（invalid = 不正カーソル → 400）。 */
export type PagedResult<T> = ({ ok: true } & PageResult<T>) | { ok: false; reason: "invalid" };

/**
 * カーソル付き一覧の共通処理: decode（不正は invalid）→ **pageSize+1 件**読む → ページに切り分け。
 * 「+1」の付与をここに閉じ込め、呼び出し側の渡し忘れ（静かな最終ページ誤判定）を構造的に防ぐ。
 * fetch は「limit 件・cursor より古いもの」を返すリポジトリ呼び出し。
 */
export async function fetchPage<T>(
  cursorRaw: string | undefined,
  pageSize: number,
  fetch: (limit: number, cursor: ListCursor | null) => Promise<readonly T[]>,
  cursorOf: (item: T) => ListCursor,
): Promise<PagedResult<T>> {
  const cursor = cursorRaw === undefined ? null : decodeListCursor(cursorRaw);
  if (cursorRaw !== undefined && cursor === null) return { ok: false, reason: "invalid" };
  return { ok: true, ...pageOf(await fetch(pageSize + 1, cursor), pageSize, cursorOf) };
}

/** pageSize+1 件の読み結果をページに切り分ける。cursorOf は「その行のカーソル値」
 *  （基準時刻 ms＋タイブレーク id）を返す。 */
export function pageOf<T>(
  rows: readonly T[],
  pageSize: number,
  cursorOf: (item: T) => ListCursor,
): PageResult<T> {
  const items = rows.slice(0, pageSize);
  const last = items[items.length - 1];
  const nextCursor =
    rows.length > pageSize && last !== undefined ? encodeListCursor(cursorOf(last)) : null;
  return { items, nextCursor };
}
