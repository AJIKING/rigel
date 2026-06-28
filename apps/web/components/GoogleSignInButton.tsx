"use client";

import { useState } from "react";

/**
 * Google ログインボタン（土台）。
 * 実際の Google Identity Services 連携（クライアントSDKで ID トークンを取得し
 * `POST /auth/google` に送る）は、Google クライアントID設定後に差し込む。
 */
export function GoogleSignInButton() {
  const [note, setNote] = useState<string | null>(null);
  return (
    <div>
      <button
        type="button"
        onClick={() => setNote("Google Identity Services 連携はクライアントID設定後に有効化します")}
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 8,
          padding: "10px 16px",
          borderRadius: 8,
          border: "1px solid #dadce0",
          background: "#fff",
          fontSize: 14,
          cursor: "pointer",
        }}
      >
        <span aria-hidden style={{ fontWeight: 700, color: "#4285F4" }}>
          G
        </span>
        Google でログイン
      </button>
      {note && (
        <p style={{ color: "#888", fontSize: 12, marginTop: 8 }} role="status">
          {note}
        </p>
      )}
    </div>
  );
}
