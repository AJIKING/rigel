"use client";

import Script from "next/script";
import { useEffect, useRef, useState } from "react";
import { useAuth } from "../lib/auth-context";

const CLIENT_ID = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;

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
 * `POST /auth/google` に送ってセッションを確立する。
 * NEXT_PUBLIC_GOOGLE_CLIENT_ID 未設定時は、その旨を表示して無効化する。
 */
export function GoogleSignInButton() {
  const { signInWithGoogle } = useAuth();
  const ref = useRef<HTMLDivElement>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!ready || !CLIENT_ID || !window.google || !ref.current) return;
    window.google.accounts.id.initialize({
      client_id: CLIENT_ID,
      callback: (res) => {
        signInWithGoogle(res.credential).catch(() => setError("ログインに失敗しました"));
      },
    });
    window.google.accounts.id.renderButton(ref.current, { theme: "outline", size: "large" });
  }, [ready, signInWithGoogle]);

  if (!CLIENT_ID) {
    return (
      <p style={{ color: "#888", fontSize: 13 }}>
        Google ログインは未設定です（環境変数 <code>NEXT_PUBLIC_GOOGLE_CLIENT_ID</code>{" "}
        を設定すると有効化）。
      </p>
    );
  }

  return (
    <div>
      <Script src="https://accounts.google.com/gsi/client" onLoad={() => setReady(true)} />
      <div ref={ref} />
      {error && (
        <p role="alert" style={{ color: "crimson", fontSize: 13 }}>
          {error}
        </p>
      )}
    </div>
  );
}
