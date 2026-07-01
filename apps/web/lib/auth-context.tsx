"use client";

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { type AuthUser } from "./api";

interface AuthState {
  user: AuthUser | null;
  loading: boolean;
  /** Google の idToken を BFF に渡してセッション Cookie を張る。 */
  signInWithGoogle: (idToken: string) => Promise<void>;
  /** セッション Cookie を破棄する。 */
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

/**
 * 認証コンテキスト。セッションは HttpOnly Cookie（web オリジン）で持ち、
 * クライアントはトークンを直接触らない。ユーザー情報は同一オリジンの BFF
 * （/api/me・/api/session）越しに取得する。認証が要る書き込みは Server Action 側で
 * Cookie を読むため、ここでトークンを配る必要はない。
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  // 起動時: Cookie セッションからユーザーを復元。
  useEffect(() => {
    let alive = true;
    fetch("/api/me", { cache: "no-store" })
      .then((r) => r.json() as Promise<{ user: AuthUser | null }>)
      .then((d) => {
        if (alive) setUser(d.user);
      })
      .catch(() => {})
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, []);

  const signInWithGoogle = useCallback(async (idToken: string) => {
    const res = await fetch("/api/session", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ idToken }),
    });
    if (!res.ok) throw new Error("sign-in failed");
    const d = (await res.json()) as { user: AuthUser };
    setUser(d.user);
  }, []);

  const signOut = useCallback(async () => {
    await fetch("/api/session", { method: "DELETE" }).catch(() => {});
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading, signInWithGoogle, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within <AuthProvider>");
  return ctx;
}
