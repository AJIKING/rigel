"use client";

import {
  checkoutErrorMessage,
  planLabel,
  planMonthlyPrice,
  upgradeTargets,
  type PaidPlan,
  type Plan,
} from "@rigel/ui";
import Link from "next/link";
import { useState } from "react";
import { createCheckout } from "../lib/api";
import { useAuth } from "../lib/auth-context";

/** いまのプランから上位プラン(Next/Pro)への Stripe Checkout ボタン群。 */
function UpgradeButtons({ token, plan }: { token: string; plan: Plan }) {
  const [busy, setBusy] = useState<PaidPlan | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const targets = upgradeTargets(plan);
  if (targets.length === 0) return null;

  async function onUpgrade(target: PaidPlan) {
    setBusy(target);
    setNote(null);
    try {
      const origin = window.location.origin;
      const result = await createCheckout(token, {
        plan: target,
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
      setBusy(null);
    }
  }

  return (
    <>
      {targets.map((target) => (
        <button
          key={target}
          type="button"
          onClick={() => onUpgrade(target)}
          disabled={busy !== null}
          style={{
            padding: "2px 8px",
            borderRadius: 6,
            border: "none",
            background: busy !== null ? "#999" : "#b8860b",
            color: "#fff",
            cursor: busy !== null ? "default" : "pointer",
            fontSize: 13,
          }}
        >
          {busy === target ? "…" : `${planLabel(target)} ¥${planMonthlyPrice(target)}`}
        </button>
      ))}
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
      <span style={{ color: "#555" }}>ログイン中（{planLabel(user.plan)}）</span>
      {token && <UpgradeButtons token={token} plan={user.plan} />}
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
