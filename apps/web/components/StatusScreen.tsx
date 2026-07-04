import Link from "next/link";
import s from "./status.module.css";

/**
 * エラー系ステータス画面（404 / 500 共通）。
 * app/not-found.tsx（サーバー）と app/error.tsx（クライアント）の両方から使うため
 * "use client" は付けない（onRetry を渡すのはクライアント側のみ）。
 */
export function StatusScreen({
  code,
  title,
  message,
  onRetry,
}: {
  code: number;
  title: string;
  message: string;
  onRetry?: () => void;
}) {
  return (
    <div className={`${s.shell} themeApp`}>
      <main className={s.center}>
        <p className={s.code}>{code}</p>
        <h1 className={s.h1}>{title}</h1>
        <p className={s.message}>{message}</p>
        <div className={s.actions}>
          {onRetry && (
            <button type="button" className={s.retry} onClick={onRetry}>
              再試行する
            </button>
          )}
          <Link href="/" className={s.home}>
            トップへ戻る
          </Link>
        </div>
      </main>
    </div>
  );
}
