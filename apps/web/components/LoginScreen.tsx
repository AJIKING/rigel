"use client";

import Link from "next/link";
import { useAuth } from "../lib/auth-context";
import { GoogleSignInButton } from "./GoogleSignInButton";

export function LoginScreen() {
  const { user, loading } = useAuth();

  if (loading) return <p style={{ color: "#aaa" }}>…</p>;

  if (user) {
    return (
      <div>
        <p>ログイン済みです（プラン: {user.plan === "paid" ? "有料" : "無料"}）。</p>
        <Link href="/kifu">牌譜一覧へ →</Link>
      </div>
    );
  }

  return (
    <div>
      <p style={{ color: "#555", lineHeight: 1.7 }}>
        牌譜の保存・共有には Google ログインが必要です。保存済み牌譜の閲覧はログイン不要です。
      </p>
      <GoogleSignInButton />
    </div>
  );
}
