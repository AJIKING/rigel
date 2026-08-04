import type { Page } from "@rigel/client";

// 一覧ページング（カーソル方式）のサーバ側ユーティリティ（Plan: docs/plans/list-pagination.md）。

/**
 * ページを辿って最大 maxItems 件まで集める（sitemap などサーバ側の列挙用。
 * 画面の追加読み込みには使わない＝画面は1ページずつ）。
 */
export async function collectPages<T>(
  fetchPage: (cursor?: string) => Promise<Page<T>>,
  maxItems: number,
): Promise<T[]> {
  const out: T[] = [];
  let cursor: string | undefined;
  while (out.length < maxItems) {
    const page = await fetchPage(cursor);
    out.push(...page.items);
    if (page.nextCursor === null || page.items.length === 0) break;
    cursor = page.nextCursor;
  }
  return out.slice(0, maxItems);
}
