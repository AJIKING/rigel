"use client";

import Link from "next/link";
import { useAuth } from "../lib/auth-context";

/** ヘッダーの認証状態表示（ログイン中ならプラン+ログアウト、未ログインならログインリンク）。 */
export function AuthStatus() {
  const { user, loading, signOut } = useAuth();

  if (loading) return <span style={{ color: "#aaa", fontSize: 14 }}>…</span>;

  if (!user) {
    return (
      <Link href="/login" style={{ fontSize: 14 }}>
        ログイン
      </Link>
    );
  }

  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 8, fontSize: 14 }}>
      <span style={{ color: "#555" }}>ログイン中（{user.plan === "paid" ? "有料" : "無料"}）</span>
      <button
        type="button"
        onClick={signOut}
        style={{
          padding: "2px 8px",
          borderRadius: 6,
          border: "1px solid #ccc",
          background: "#fff",
          cursor: "pointer",
          fontSize: 13,
        }}
      >
        ログアウト
      </button>
    </span>
  );
}
