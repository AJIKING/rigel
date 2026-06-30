"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "../lib/auth-context";
import { BrandMark } from "./BrandMark";
import s from "./app-header.module.css";

/**
 * アプリ共通ヘッダー。ログイン状態で出し分ける:
 *  - 未ログイン: 「公開牌譜」のみ。右肩は「ログイン」ボタン（マイページ導線・アバターは出さない）。
 *  - ログイン中: 「マイページ / 公開牌譜」。右肩は設定へ飛ぶアバター。
 * `active` で現在地のタブをハイライトする。
 */
export function AppHeader({ active }: { active?: "mine" | "public" | "settings" }) {
  const { user, loading } = useAuth();
  const router = useRouter();

  const initial = (user?.displayName || user?.handle || "").trim()[0]?.toUpperCase();

  return (
    <header className={s.header}>
      <Link href={user ? "/kifu" : "/explore"} className={s.brand} aria-label="ホーム">
        <BrandMark wordmarkClassName={s.brandName} />
      </Link>

      <nav className={s.topnav}>
        {user && (
          <Link href="/kifu" className={`${s.navItem} ${active === "mine" ? s.on : ""}`}>
            マイページ
          </Link>
        )}
        <Link href="/explore" className={`${s.navItem} ${active === "public" ? s.on : ""}`}>
          公開牌譜
        </Link>
      </nav>

      <div className={s.spacer} />

      {loading ? null : user ? (
        <button
          type="button"
          className={s.avatar}
          aria-label="設定"
          onClick={() => router.push("/settings")}
        >
          {initial ?? (
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M12 12a5 5 0 1 0 0-10 5 5 0 0 0 0 10zm0 2c-5 0-9 2.5-9 6v2h18v-2c0-3.5-4-6-9-6z" />
            </svg>
          )}
        </button>
      ) : (
        <Link href="/login" className={s.loginBtn}>
          ログイン
        </Link>
      )}
    </header>
  );
}
