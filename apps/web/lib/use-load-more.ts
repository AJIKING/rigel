"use client";

// 一覧の「もっと見る」共通機構（カーソル方式。Plan: docs/plans/list-pagination.md 3-5）。
// 6画面が同じ ~20 行を持っていた頃、コピーごとのガード差がそのままバグになった
// （refetch との競合でボタンが「読み込み中…」のまま固まる等。2026-08-04 品質パス）ため、
// 正しい実装をここ1箇所に集める。

import { useCallback, useRef, useState } from "react";

/**
 * カーソル付き一覧の追加読み込み。
 * - 取得中カーソルを固定し、連打・reset との競合による stale 追記を防ぐ
 * - `loadingMore` は finally で必ず false に戻す（reset と競合してもボタンが固まらない）
 * - `onPage` は「そのカーソルの結果がまだ有効」なときだけ呼ばれる
 * - fetchPage が null を返したら（対象消失など）失敗として見せる（無反応ボタンにしない）
 */
export function useLoadMore<P extends { nextCursor: string | null }>(
  fetchPage: (cursor: string) => Promise<P | null>,
  onPage: (page: P) => void,
  initialCursor: string | null = null,
) {
  const [nextCursor, setNextCursor] = useState(initialCursor);
  const [loadingMore, setLoadingMore] = useState(false);
  const [moreFailed, setMoreFailed] = useState(false);
  const loadingCursorRef = useRef<string | null>(null);

  const loadMore = useCallback(async () => {
    if (nextCursor === null || loadingMore) return;
    const cursor = nextCursor;
    loadingCursorRef.current = cursor;
    setLoadingMore(true);
    setMoreFailed(false);
    try {
      const page = await fetchPage(cursor);
      if (loadingCursorRef.current !== cursor) return; // reset 済み（stale。結果は捨てる）
      if (page === null) {
        setMoreFailed(true);
        return;
      }
      onPage(page);
      setNextCursor(page.nextCursor);
    } catch {
      if (loadingCursorRef.current === cursor) setMoreFailed(true);
    } finally {
      if (loadingCursorRef.current === cursor) loadingCursorRef.current = null;
      setLoadingMore(false);
    }
  }, [nextCursor, loadingMore, fetchPage, onPage]);

  /** refetch 等で一覧を先頭ページへ戻すとき呼ぶ（in-flight の追記は破棄される）。 */
  const reset = useCallback((cursor: string | null) => {
    loadingCursorRef.current = null;
    setNextCursor(cursor);
    setMoreFailed(false);
  }, []);

  return { nextCursor, loadingMore, moreFailed, loadMore, reset };
}
