"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { useAuth } from "../lib/auth-context";
import { AppleSignInButton } from "./AppleSignInButton";
import { GoogleSignInButton } from "./GoogleSignInButton";
import { BrandMark } from "./BrandMark";
import s from "./login.module.css";

export function LoginScreen() {
  const { user, loading } = useAuth();
  const router = useRouter();

  // ログイン済みになったらマイページへ。
  useEffect(() => {
    if (user) router.replace("/mypage");
  }, [user, router]);

  return (
    <div className={`${s.shell} themeApp`}>
      <main className={s.login}>
        <div className={s.inner}>
          <div className={s.chip} aria-hidden="true">
            <i className={`${s.h} ${s.tt}`} />
            <i className={`${s.h} ${s.bb}`} />
            <i className={`${s.v} ${s.ll}`} />
            <i className={`${s.v} ${s.rr}`} />
            <i className={s.dot} />
          </div>
          <div className={s.brand}>
            <BrandMark wordmarkClassName={s.wm} />
          </div>

          {loading ? (
            <p className={s.status}>読み込み中…</p>
          ) : user ? (
            <p className={`${s.status} ${s.statusOk}`}>サインイン済みです。移動します…</p>
          ) : (
            <>
              <p className={s.tagline}>
                牌譜の保存・共有にはサインインが必要です。
                <br />
                公開牌譜の閲覧はどなたでも可能です。
              </p>
              <GoogleSignInButton />
              {/* App Store 審査要件 4.8: Apple ログインを併設（iOS アプリと同じアカウントで
                  web からも入れる）。NEXT_PUBLIC_APPLE_CLIENT_ID 未設定なら出ない。 */}
              <AppleSignInButton />
              <Link href="/kifu" className={s.browse}>
                牌譜をみてみる
              </Link>
              <p className={s.legal}>
                続行すると、<Link href="/terms">利用規約</Link> と{" "}
                <Link href="/privacy">プライバシーポリシー</Link> に同意したものとみなされます。
              </p>
            </>
          )}
        </div>
      </main>
      <div className={s.foot}>© 2026 RIGEL</div>
    </div>
  );
}
