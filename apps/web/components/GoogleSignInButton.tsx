"use client";

import Script from "next/script";
import { useEffect, useRef, useState } from "react";
import { useAuth } from "../lib/auth-context";
import s from "./login.module.css";

// GIS の client_id は「単一のウェブアプリケーション ID」のみ。api の GOOGLE_CLIENT_ID
// （カンマ区切りで web/iOS を許可）と取り違えてカンマ区切りを設定すると Google が
// invalid_client を返すため、誤設定でも先頭の1つだけを使う。
const CLIENT_ID = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID?.split(",")[0]?.trim();

// Google Identity Services の最小型定義。
interface GoogleId {
  initialize(config: { client_id: string; callback: (res: { credential: string }) => void }): void;
  renderButton(el: HTMLElement, options: Record<string, unknown>): void;
}
declare global {
  interface Window {
    google?: { accounts: { id: GoogleId } };
  }
}

/**
 * Google ログインボタン。Google Identity Services を読み込み、取得した ID トークンを
 * `POST /auth/google` に送ってセッションを確立する。デザインに合わせ白・大・日本語表記。
 * CLIENT_ID(NEXT_PUBLIC_GOOGLE_CLIENT_ID) 未設定時は、内部情報を出さず
 * 「ご利用いただけません」の中立的な文言だけ表示して無効化する。
 */
export function GoogleSignInButton() {
  const { signInWithGoogle } = useAuth();
  const ref = useRef<HTMLDivElement>(null);
  // 利用規約→ログインなどクライアント遷移で戻ると、GIS スクリプトはロード済みで
  // onLoad が再発火しない。マウント時に window.google が居れば即 ready にする。
  const [ready, setReady] = useState(() => typeof window !== "undefined" && !!window.google);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!ready || !CLIENT_ID || !window.google || !ref.current) return;
    window.google.accounts.id.initialize({
      client_id: CLIENT_ID,
      callback: (res) => {
        signInWithGoogle(res.credential).catch(() => setError("サインインに失敗しました"));
      },
    });
    window.google.accounts.id.renderButton(ref.current, {
      type: "standard",
      theme: "filled_white",
      size: "large",
      text: "signin_with",
      shape: "rectangular",
      logo_alignment: "center",
      locale: "ja",
      width: 320,
    });
  }, [ready, signInWithGoogle]);

  if (!CLIENT_ID) {
    return <p className={s.notice}>ただいまサインインをご利用いただけません。</p>;
  }

  return (
    <>
      {/* onReady はマウントごとに発火する（onLoad は初回ロードの1回だけ＝再訪でボタンが出ない）。 */}
      <Script src="https://accounts.google.com/gsi/client" onReady={() => setReady(true)} />
      <div className={s.gwrap}>
        <div ref={ref} />
      </div>
      {error && (
        <p role="alert" className={s.err}>
          {error}
        </p>
      )}
    </>
  );
}
