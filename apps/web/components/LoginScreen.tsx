"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { useAuth } from "../lib/auth-context";
import { GoogleSignInButton } from "./GoogleSignInButton";
import s from "./login.module.css";

export function LoginScreen() {
  const { user, loading } = useAuth();
  const router = useRouter();

  // ログイン済みになったら牌譜一覧へ。
  useEffect(() => {
    if (user) router.replace("/kifu");
  }, [user, router]);

  return (
    <div className={s.shell}>
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
            <svg viewBox="0 0 24 24" fill="none">
              <path
                d="M12 1.6l2.7 6.9 7.4.4-5.8 4.6 2 7.1L12 16.9 5.7 20.6l2-7.1L1.9 8.9l7.4-.4z"
                fill="#ff9e45"
              />
            </svg>
            <span className={s.wm}>RIGEL</span>
          </div>

          {loading ? (
            <p className={s.status}>読み込み中…</p>
          ) : user ? (
            <p className={`${s.status} ${s.statusOk}`}>ログイン済みです。移動します…</p>
          ) : (
            <>
              <p className={s.tagline}>
                牌譜の保存・共有には Google ログインが必要です。
                <br />
                保存済み牌譜の閲覧はログイン不要です。
              </p>
              <GoogleSignInButton />
              <p className={s.legal}>
                続行すると、<a href="#">利用規約</a> と <a href="#">プライバシーポリシー</a>{" "}
                に同意したものとみなされます。
              </p>
            </>
          )}
        </div>
      </main>
      <div className={s.foot}>© 2026 RIGEL</div>
    </div>
  );
}
