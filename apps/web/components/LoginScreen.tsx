"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import type { CSSProperties } from "react";
import { useAuth } from "../lib/auth-context";
import { GoogleSignInButton } from "./GoogleSignInButton";

const card: CSSProperties = {
  width: "100%",
  maxWidth: 380,
  border: "1px solid #eee",
  borderRadius: 12,
  padding: 28,
  background: "#fff",
  boxShadow: "0 1px 6px rgba(0,0,0,0.06)",
};

export function LoginScreen() {
  const { user, loading } = useAuth();
  const router = useRouter();

  // ログイン済みになったら牌譜一覧へ。
  useEffect(() => {
    if (user) router.replace("/kifu");
  }, [user, router]);

  return (
    <div style={{ display: "flex", justifyContent: "center", paddingTop: 32 }}>
      <div style={card}>
        <div style={{ textAlign: "center", marginBottom: 20 }}>
          <div style={{ fontSize: 28, fontWeight: 800, letterSpacing: 1 }}>rigel</div>
          <div style={{ color: "#888", fontSize: 13, marginTop: 2 }}>麻雀牌譜を、写真から</div>
        </div>

        {loading ? (
          <p style={{ textAlign: "center", color: "#aaa", margin: 0 }}>読み込み中…</p>
        ) : user ? (
          <p style={{ textAlign: "center", color: "#1b7a2f", margin: 0 }}>
            ログイン済みです。移動します…
          </p>
        ) : (
          <>
            <p style={{ color: "#555", lineHeight: 1.7, fontSize: 14, marginTop: 0 }}>
              牌譜の保存・共有には Google ログインが必要です。
              <br />
              保存済み牌譜の閲覧はログイン不要です。
            </p>
            <div style={{ display: "flex", justifyContent: "center", marginTop: 16 }}>
              <GoogleSignInButton />
            </div>
          </>
        )}
      </div>
    </div>
  );
}
