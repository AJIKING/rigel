"use client";

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { authWithGoogle, fetchMe, type AuthUser } from "./api";

const TOKEN_KEY = "rigel.session";

interface AuthState {
  user: AuthUser | null;
  loading: boolean;
  signInWithGoogle: (idToken: string) => Promise<void>;
  signOut: () => void;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  // 起動時: 保存済みトークンがあれば /me で復元。
  useEffect(() => {
    const token = readToken();
    if (!token) {
      setLoading(false);
      return;
    }
    fetchMe(token)
      .then((u) => {
        if (!u) clearToken();
        setUser(u);
      })
      .finally(() => setLoading(false));
  }, []);

  const signInWithGoogle = useCallback(async (idToken: string) => {
    const { sessionToken, user: u } = await authWithGoogle(idToken);
    writeToken(sessionToken);
    setUser(u);
  }, []);

  const signOut = useCallback(() => {
    clearToken();
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
