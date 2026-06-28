"use client";

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { authWithGoogle, fetchMe, type AuthUser } from "./api";

const TOKEN_KEY = "rigel.session";

interface AuthState {
  user: AuthUser | null;
  /** セッショントークン（API 呼び出し用）。 */
  token: string | null;
  loading: boolean;
  signInWithGoogle: (idToken: string) => Promise<void>;
  signOut: () => void;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // 起動時: 保存済みトークンがあれば /me で復元。
  useEffect(() => {
    const saved = readToken();
    if (!saved) {
      setLoading(false);
      return;
    }
    fetchMe(saved)
      .then((u) => {
        if (u) {
          setUser(u);
          setToken(saved);
        } else {
          clearToken();
        }
      })
      .finally(() => setLoading(false));
  }, []);

  const signInWithGoogle = useCallback(async (idToken: string) => {
    const { sessionToken, user: u } = await authWithGoogle(idToken);
    writeToken(sessionToken);
    setToken(sessionToken);
    setUser(u);
  }, []);

  const signOut = useCallback(() => {
    clearToken();
    setToken(null);
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider value={{ user, token, loading, signInWithGoogle, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within <AuthProvider>");
  return ctx;
}

function readToken(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(TOKEN_KEY);
}
function writeToken(token: string): void {
  window.localStorage.setItem(TOKEN_KEY, token);
}
function clearToken(): void {
  if (typeof window !== "undefined") window.localStorage.removeItem(TOKEN_KEY);
}
