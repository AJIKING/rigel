"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "../lib/auth-context";
import { BrandMark } from "./BrandMark";
import s from "./app-header.module.css";

/**
 * アプリ共通ヘッダー。ナビは「牌譜（公開一覧）・何切る（公開一覧）・特訓・マイページ」。
 *  - 未ログイン: 牌譜・何切る・特訓のみ。右肩は「ログイン」ボタン（マイページ・アバターは出さない）。
 *  - ログイン中: マイページが加わり、右肩は設定へ飛ぶアバター。
 * `active` で現在地のタブをハイライトする。
 * `anchors` はページ内アンカー（LP の できること/プラン）。ナビの先頭に並べ、狭幅では隠す。
 */
export function AppHeader({
  active,
  anchors,
}: {
  active?: "kifu" | "problems" | "training" | "mypage" | "settings";
  anchors?: readonly { href: string; label: string }[];
}) {
  const { user, loading } = useAuth();
  const router = useRouter();

  const initial = (user?.displayName || user?.handle || "").trim()[0]?.toUpperCase();

  return (
    <header className={s.header}>
      <Link href={user ? "/mypage" : "/kifu"} className={s.brand} aria-label="ホーム">
        <BrandMark wordmarkClassName={s.brandName} />
      </Link>

      <nav className={s.topnav}>
        {anchors?.map((a) => (
          <a key={a.href} href={a.href} className={`${s.navItem} ${s.anchor}`}>
            {a.label}
          </a>
        ))}
        {/* 現在地は色（s.on）に加えて aria-current="page" で支援技術にも伝える。 */}
        <Link
          href="/kifu"
          className={`${s.navItem} ${active === "kifu" ? s.on : ""}`}
          aria-current={active === "kifu" ? "page" : undefined}
        >
          牌譜
        </Link>
        <Link
          href="/problems"
          className={`${s.navItem} ${active === "problems" ? s.on : ""}`}
          aria-current={active === "problems" ? "page" : undefined}
        >
          何切る
        </Link>
        <Link
          href="/training"
          className={`${s.navItem} ${active === "training" ? s.on : ""}`}
          aria-current={active === "training" ? "page" : undefined}
        >
          特訓
        </Link>
        {user && (
          <Link
            href="/mypage"
            className={`${s.navItem} ${active === "mypage" ? s.on : ""}`}
            aria-current={active === "mypage" ? "page" : undefined}
          >
            マイページ
          </Link>
        )}
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
          サインイン
        </Link>
      )}
    </header>
  );
}
