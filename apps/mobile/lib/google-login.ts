// Google ログインのクライアントID設定（expo-auth-session useIdTokenAuthRequest に渡す形）。
//
// expo-auth-session v6 はプラットフォームごとに androidClientId ?? clientId を選ぶ
// （build/providers/Google.js）。rigel の割り当て:
//   EXPO_PUBLIC_GOOGLE_CLIENT_ID         … iOS 用 OAuth クライアントID（app.json の
//                                          CFBundleURLSchemes と対。web の値とは別物）
//   EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID … Android 用 OAuth クライアントID（package+SHA-1 検証）
// api 側は GOOGLE_CLIENT_ID のカンマ区切りで両方の aud を許可する。

export interface GoogleClientConfig {
  clientId: string;
  androidClientId?: string;
}

/**
 * env 由来の値から useIdTokenAuthRequest 用の設定を作る。
 * ベースの clientId が無ければ null（= ログイン無効。現行挙動を維持）。
 * 空文字は「未設定」扱い（env の空定義で誤って有効化しない）。
 */
export function googleClientConfig(env: {
  clientId?: string;
  androidClientId?: string;
}): GoogleClientConfig | null {
  const clientId = env.clientId || undefined;
  if (!clientId) return null;
  return { clientId, androidClientId: env.androidClientId || undefined };
}
