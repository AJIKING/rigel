"use client";

import { ANALYTICS_EVENTS, type LoginMethod } from "@rigel/ui";
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { trackEvent } from "./analytics";
import { type AuthUser } from "./api";

interface AuthState {
  user: AuthUser | null;
  loading: boolean;
  /** Google の idToken を BFF に渡してセッション Cookie を張る。 */
  signInWithGoogle: (idToken: string) => Promise<void>;
  /** Apple の idToken を BFF に渡してセッション Cookie を張る（App Store 審査要件 4.8）。
   *  authorizationCode は退会時のトークン失効用（任意）。 */
  signInWithApple: (idToken: string, authorizationCode?: string) => Promise<void>;
  /** セッション Cookie を破棄する。 */
  signOut: () => Promise<void>;
  /** /api/me を再取得して user を最新化する（購入反映待ちなど。mobile の refresh と対）。 */
  refresh: () => Promise<void>;
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

  // BFF にトークンを渡してセッション Cookie を張る（Google/Apple 共通の芯）。
  // 成立したら計測（初回登録=sign_up / 既存=login。プロバイダ別。PII は送らない）。
  const postSession = useCallback(async (method: LoginMethod, body: Record<string, unknown>) => {
    const res = await fetch("/api/session", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error("sign-in failed");
    const d = (await res.json()) as { user: AuthUser; created?: boolean };
    setUser(d.user);
    trackEvent(d.created ? ANALYTICS_EVENTS.signUp : ANALYTICS_EVENTS.login, { method });
  }, []);

  const signInWithGoogle = useCallback(
    (idToken: string) => postSession("google", { idToken }),
    [postSession],
  );

  const signInWithApple = useCallback(
    (idToken: string, authorizationCode?: string) =>
      postSession("apple", { provider: "apple", idToken, authorizationCode }),
    [postSession],
  );

  const signOut = useCallback(async () => {
    await fetch("/api/session", { method: "DELETE" }).catch(() => {});
    setUser(null);
  }, []);

  const refresh = useCallback(async () => {
    const res = await fetch("/api/me", { cache: "no-store" }).catch(() => null);
    if (!res?.ok) return;
    const d = (await res.json()) as { user: AuthUser | null };
    setUser(d.user);
  }, []);

  return (
    <AuthContext.Provider
      value={{ user, loading, signInWithGoogle, signInWithApple, signOut, refresh }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within <AuthProvider>");
  return ctx;
}
