// 一覧の追加読み込み共通機構（カーソル方式・onEndReached 用。web の lib/use-load-more と
// 同じ規約: 取得中カーソルの固定で多重発火・reset 競合の stale 追記を防ぎ、loadingMore は
// finally で必ず戻す。Plan: docs/plans/list-pagination.md 3-5）。
// 失敗は moreFailed に出す（無音にしない。ListFooter が文言を出し、スクロールで再試行できる）。

import { useCallback, useRef, useState } from "react";

export function useLoadMore<P extends { nextCursor: string | null }>(
  fetchPage: (cursor: string) => Promise<P | null>,
  onPage: (page: P) => void,
) {
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [moreFailed, setMoreFailed] = useState(false);
  const loadingCursorRef = useRef<string | null>(null);
  const activeRef = useRef(true);

  const loadMore = useCallback(() => {
    if (nextCursor === null || loadingCursorRef.current !== null) return;
    const cursor = nextCursor;
    loadingCursorRef.current = cursor;
    setLoadingMore(true);
    setMoreFailed(false);
    fetchPage(cursor)
      .then((page) => {
        if (!activeRef.current || loadingCursorRef.current !== cursor) return;
        if (page === null) {
          setMoreFailed(true); // 対象消失も失敗として見せる（無反応にしない）
          return;
        }
        onPage(page);
        setNextCursor(page.nextCursor);
      })
      .catch(() => {
        if (activeRef.current && loadingCursorRef.current === cursor) setMoreFailed(true);
      })
      .finally(() => {
        if (loadingCursorRef.current === cursor) loadingCursorRef.current = null;
        if (activeRef.current) setLoadingMore(false);
      });
  }, [nextCursor, fetchPage, onPage]);

  /** 先頭ページの取得（初回・refetch・フォーカス時）が完了したら呼ぶ。
   *  in-flight の追記は破棄される（前のデータ・前のユーザーの結果を混ぜない）。 */
  const reset = useCallback((cursor: string | null) => {
    loadingCursorRef.current = null;
    setNextCursor(cursor);
    setMoreFailed(false);
  }, []);

  /** アンマウント後の setState を防ぐ。マウント側 effect で
   *  `activeRef.current = true; return () => { activeRef.current = false; }` の形で使う。 */
  return { nextCursor, loadingMore, moreFailed, loadMore, reset, activeRef };
}
