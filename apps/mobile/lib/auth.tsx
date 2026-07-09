import * as SecureStore from "expo-secure-store";
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { authWithGoogle, fetchMe, type AuthUser } from "./api";
import { logInPurchases, logOutPurchases } from "./purchases";

const TOKEN_KEY = "rigel.session";

interface AuthState {
  user: AuthUser | null;
  /** セッショントークン（API 呼び出し用）。 */
  token: string | null;
  loading: boolean;
  signInWithGoogle: (idToken: string) => Promise<void>;
  signOut: () => void;
  /** /me を再取得して user を最新化する（プロフィール保存後など）。 */
  refresh: () => Promise<void>;
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
        // RevenueCat に userId を紐づける（web=Stripe/アプリ=IAP 横串の要）。
        void logInPurchases(u.id);
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
    // RevenueCat に userId を紐づける（購入がこのアカウントに乗る）。
    void logInPurchases(u.id);
  }, []);

  const signOut = useCallback(() => {
    void SecureStore.deleteItemAsync(TOKEN_KEY);
    void logOutPurchases();
    setToken(null);
    setUser(null);
  }, []);

  const refresh = useCallback(async () => {
    if (!token) return;
    const u = await fetchMe(token);
    if (u) setUser(u);
  }, [token]);

  return (
    <AuthContext.Provider value={{ user, token, loading, signInWithGoogle, signOut, refresh }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within <AuthProvider>");
  return ctx;
}
