"use client";

import { checkoutErrorMessage } from "@rigel/ui";
import Link from "next/link";
import { useState } from "react";
import { createCheckout } from "../lib/api";
import { useAuth } from "../lib/auth-context";

/** 無料ユーザー向けの有料アップグレードボタン。Stripe Checkout へ遷移する。 */
function UpgradeButton({ token }: { token: string }) {
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  async function onUpgrade() {
    setBusy(true);
    setNote(null);
    try {
      const origin = window.location.origin;
      const result = await createCheckout(token, {
        successUrl: `${origin}/kifu`,
        cancelUrl: `${origin}/`,
      });
      if (result.ok) {
        window.location.href = result.url;
        return;
      }
      setNote(checkoutErrorMessage(result.status));
    } catch {
      setNote("通信に失敗しました。");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={onUpgrade}
        disabled={busy}
        style={{
          padding: "2px 8px",
          borderRadius: 6,
          border: "none",
          background: busy ? "#999" : "#b8860b",
          color: "#fff",
          cursor: busy ? "default" : "pointer",
          fontSize: 13,
        }}
      >
        {busy ? "…" : "有料にする"}
      </button>
      {note && <span style={{ color: "#a60", fontSize: 12 }}>{note}</span>}
    </>
  );
}

/** ヘッダーの認証状態表示（ログイン中ならプラン+ログアウト、未ログインならログインリンク）。 */
export function AuthStatus() {
  const { user, token, loading, signOut } = useAuth();

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
      {user.plan === "free" && token && <UpgradeButton token={token} />}
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
