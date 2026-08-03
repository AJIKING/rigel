"use client";

import { APPLE_SIGN_IN_LABEL } from "@rigel/ui";
import Script from "next/script";
import { useState } from "react";
import { useAuth } from "../lib/auth-context";
import s from "./login.module.css";

// Sign in with Apple の Services ID（web 用 client_id。公開値）。
// 未設定の環境ではボタン自体を出さない（Google のみ＝従来どおり）。
const CLIENT_ID = process.env.NEXT_PUBLIC_APPLE_CLIENT_ID?.trim();

// Apple JS (appleid.auth.js) の最小型定義。
interface AppleAuthApi {
  init(config: { clientId: string; scope: string; redirectURI: string; usePopup: boolean }): void;
  signIn(): Promise<{ authorization: { id_token: string; code: string } }>;
}
declare global {
  interface Window {
    AppleID?: { auth: AppleAuthApi };
  }
}

function AppleLogo() {
  return (
    <svg width={17} height={17} viewBox="0 0 170 170" aria-hidden="true">
      <path
        fill="currentColor"
        d="M150.37 130.25c-2.45 5.66-5.35 10.87-8.71 15.66-4.58 6.53-8.33 11.05-11.22 13.56-4.48 4.12-9.28 6.23-14.42 6.35-3.69 0-8.14-1.05-13.32-3.18-5.2-2.12-9.98-3.17-14.34-3.17-4.58 0-9.49 1.05-14.75 3.17-5.27 2.13-9.51 3.24-12.76 3.35-4.93.21-9.84-1.96-14.75-6.52-3.13-2.73-7.05-7.41-11.75-14.04-5.04-7.09-9.18-15.32-12.43-24.7-3.48-10.13-5.23-19.94-5.23-29.44 0-10.88 2.35-20.26 7.06-28.12 3.7-6.32 8.62-11.3 14.78-14.96 6.16-3.65 12.82-5.51 19.99-5.63 3.91 0 9.05 1.21 15.43 3.59 6.36 2.39 10.45 3.6 12.24 3.6 1.34 0 5.87-1.42 13.57-4.24 7.28-2.61 13.42-3.7 18.44-3.27 13.63 1.1 23.87 6.47 30.68 16.15-12.19 7.39-18.22 17.73-18.1 31 .11 10.34 3.86 18.94 11.23 25.77 3.34 3.17 7.07 5.62 11.22 7.36-.9 2.61-1.85 5.11-2.86 7.51zM119.11 7.24c0 8.12-2.97 15.7-8.88 22.72-7.13 8.35-15.76 13.17-25.12 12.41a25.3 25.3 0 0 1-.19-3.07c0-7.8 3.39-16.14 9.42-22.96 3.01-3.45 6.84-6.32 11.48-8.61C110.44 5.47 114.82 4.22 119 4c.12 1.08.11 2.16.11 3.24z"
      />
    </svg>
  );
}

/**
 * Sign in with Apple ボタン（web）。Apple JS のポップアップで id_token を取得し、
 * BFF（/api/session, provider=apple）でセッション Cookie を張る。
 * App Store 審査要件 4.8 の対応（iOS アプリと同じアカウントに web からも入れるように
 * web にも併設する）。redirectURI はこの /login（Services ID に登録が必要）。
 */
export function AppleSignInButton() {
  const { signInWithApple } = useAuth();
  const [ready, setReady] = useState(() => typeof window !== "undefined" && !!window.AppleID);
  const [error, setError] = useState<string | null>(null);

  if (!CLIENT_ID) return null;

  async function onClick() {
    const apple = window.AppleID;
    if (!apple) return;
    try {
      apple.auth.init({
        clientId: CLIENT_ID!,
        scope: "email",
        redirectURI: `${window.location.origin}/login`,
        usePopup: true,
      });
      const res = await apple.auth.signIn();
      await signInWithApple(res.authorization.id_token, res.authorization.code);
    } catch (e) {
      // ポップアップを閉じた（キャンセル）はエラー表示しない。
      const code = (e as { error?: string } | null)?.error ?? "";
      if (code !== "popup_closed_by_user" && code !== "user_cancelled_authorize") {
        setError("サインインに失敗しました");
      }
    }
  }

  return (
    <>
      <Script
        src="https://appleid.cdn-apple.com/appleauth/static/jsapi/appleid/1/ja_JP/appleid.auth.js"
        onReady={() => setReady(true)}
      />
      <button type="button" className={s.abtn} disabled={!ready} onClick={() => void onClick()}>
        <AppleLogo />
        {APPLE_SIGN_IN_LABEL}
      </button>
      {error && (
        <p role="alert" className={s.err}>
          {error}
        </p>
      )}
    </>
  );
}
