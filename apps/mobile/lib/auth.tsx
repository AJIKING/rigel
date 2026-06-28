import * as SecureStore from "expo-secure-store";
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

  // 起動時: SecureStore のトークンがあれば /me で復元。
  useEffect(() => {
    void (async () => {
      const saved = await SecureStore.getItemAsync(TOKEN_KEY);
      if (!saved) {
        setLoading(false);
        return;
      }
      const u = await fetchMe(saved);
      if (u) {
        setUser(u);
        setToken(saved);
      } else {
        await SecureStore.deleteItemAsync(TOKEN_KEY);
      }
      setLoading(false);
    })();
  }, []);

  const signInWithGoogle = useCallback(async (idToken: string) => {
    const { sessionToken, user: u } = await authWithGoogle(idToken);
    await SecureStore.setItemAsync(TOKEN_KEY, sessionToken);
    setToken(sessionToken);
    setUser(u);
  }, []);

  const signOut = useCallback(() => {
    void SecureStore.deleteItemAsync(TOKEN_KEY);
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
