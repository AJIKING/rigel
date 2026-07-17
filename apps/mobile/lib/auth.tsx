import * as SecureStore from "expo-secure-store";
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { AppState } from "react-native";
import { authWithApple, authWithGoogle, fetchMe, type AuthUser } from "./api";
import { logInPurchases, logOutPurchases } from "./purchases";

const TOKEN_KEY = "rigel.session";

interface AuthState {
  user: AuthUser | null;
  /** セッショントークン（API 呼び出し用）。 */
  token: string | null;
  loading: boolean;
  signInWithGoogle: (idToken: string) => Promise<void>;
  /** Apple の identityToken でログイン（iOS。App Store 審査要件 4.8）。
   *  authorizationCode は退会時のトークン失効用（任意）。 */
  signInWithApple: (idToken: string, authorizationCode?: string) => Promise<void>;
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

  // サインイン成立後の共通処理（Google/Apple 共通の芯）: トークン保存・状態反映・
  // RevenueCat に userId を紐づける（購入がこのアカウントに乗る）。
  const establishSession = useCallback(
    async ({ sessionToken, user: u }: { sessionToken: string; user: AuthUser }) => {
      await SecureStore.setItemAsync(TOKEN_KEY, sessionToken);
      setToken(sessionToken);
      setUser(u);
      void logInPurchases(u.id);
    },
    [],
  );

  const signInWithGoogle = useCallback(
    async (idToken: string) => establishSession(await authWithGoogle(idToken)),
    [establishSession],
  );

  const signInWithApple = useCallback(
    async (idToken: string, authorizationCode?: string) =>
      establishSession(await authWithApple(idToken, authorizationCode)),
    [establishSession],
  );

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

  // フォアグラウンド復帰で /me を再取得する。plan はアプリの外（web=Stripe 購入・
  // 購読の失効・購読管理での変更）でも変わるため、開き直しなしで表示に追従させる。
  useEffect(() => {
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active") void refresh();
    });
    return () => sub.remove();
  }, [refresh]);

  return (
    <AuthContext.Provider
      value={{ user, token, loading, signInWithGoogle, signInWithApple, signOut, refresh }}
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
