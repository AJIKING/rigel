"use client";

import { LIST_LOAD_MORE_ERROR_MESSAGE, LIST_LOAD_MORE_LABEL } from "@rigel/ui";
import s from "./kifu-list.module.css";

/**
 * 一覧末尾の「もっと見る」（カーソルが残っている間だけ出す。use-load-more とセット）。
 * 失敗しても表示中の一覧は保ち、role=alert の文言とボタンで再試行できる。
 */
export function LoadMoreButton({
  nextCursor,
  loadingMore,
  moreFailed,
  onLoadMore,
}: {
  nextCursor: string | null;
  loadingMore: boolean;
  moreFailed: boolean;
  onLoadMore: () => void;
}) {
  return (
    <>
      {moreFailed && (
        <p className={s.favError} role="alert">
          {LIST_LOAD_MORE_ERROR_MESSAGE}
        </p>
      )}
      {nextCursor !== null && (
        <div className={s.moreRow}>
          <button
            type="button"
            className={s.moreBtn}
            disabled={loadingMore}
            aria-busy={loadingMore}
            onClick={onLoadMore}
          >
            {loadingMore ? "読み込み中…" : LIST_LOAD_MORE_LABEL}
          </button>
        </div>
      )}
    </>
  );
}
