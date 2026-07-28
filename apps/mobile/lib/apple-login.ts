// Android 用 Sign in with Apple（web フロー）の純粋ロジック。
//
// iOS は expo-apple-authentication の純正ボタン（HIG 要件）だが、Android には純正が無く、
// Apple は redirect_uri に HTTPS しか許さない（カスタム scheme 不可・scope 付きは
// response_mode=form_post 固定）。そこで:
//   1. ここで組んだ authorize URL を Custom Tabs で開く（client_id = web の Services ID）
//   2. Apple が api の POST /auth/apple/callback へ form_post
//   3. api がアプリの scheme（APPLE_REDIRECT_URL）へ 302 で中継
//   4. parseAppleCallbackUrl で id_token を取り出し、既存の signInWithApple へ
// 環境変数:
//   EXPO_PUBLIC_APPLE_CLIENT_ID … web と同じ Services ID（例: jp.co.plaria.rigel.web。公開値）
//   EXPO_PUBLIC_API_URL         … api のベースURL（redirect_uri の組み立てに使う）
// Apple Developer 側で Services ID の Return URLs に <api>/auth/apple/callback の登録が必要。

/** 中継の着地先（api 側 account.routes.ts の APPLE_CALLBACK_APP_URL と一致必須。
 *  scheme は app.json の "scheme"）。 */
export const APPLE_REDIRECT_URL = "jp.co.plaria.rigel://apple-callback";

export interface AppleWebLoginConfig {
  servicesId: string;
  apiUrl: string;
}

/**
 * env 由来の値から web フロー設定を作る。どちらか欠けたら null（= ボタンを出さない）。
 * 空文字は「未設定」扱い（googleClientConfig と同じ流儀）。
 */
export function appleWebLoginConfig(env: {
  servicesId?: string;
  apiUrl?: string;
}): AppleWebLoginConfig | null {
  const servicesId = env.servicesId || undefined;
  const apiUrl = env.apiUrl || undefined;
  if (!servicesId || !apiUrl) return null;
  return { servicesId, apiUrl: apiUrl.replace(/\/+$/, "") };
}

/** Apple の authorize URL を組む。state はアプリが発行し、コールバックで照合する。 */
export function buildAppleAuthorizeUrl(config: AppleWebLoginConfig, state: string): string {
  const params = new URLSearchParams({
    client_id: config.servicesId,
    redirect_uri: `${config.apiUrl}/auth/apple/callback`,
    response_type: "code id_token",
    scope: "email",
    response_mode: "form_post",
    state,
  });
  return `https://appleid.apple.com/auth/authorize?${params.toString()}`;
}

/**
 * 中継からのコールバック URL を解析する。state 不一致・error・id_token 欠落は null
 * （呼び出し側は null なら黙って戻る＝キャンセルと同じ扱い）。
 * Hermes の URL/URLSearchParams に依存せず自前でクエリを分解する。
 */
export function parseAppleCallbackUrl(
  url: string,
  expectedState: string,
): { idToken: string; authorizationCode?: string } | null {
  const query = url.split("?")[1];
  if (!query) return null;
  // form-urlencoded の復元（+ は空白）。キー・値とも同じ規則で戻す。
  const decode = (s: string) => decodeURIComponent(s.replace(/\+/g, "%20"));
  const params: Record<string, string> = {};
  for (const pair of query.split("&")) {
    const eq = pair.indexOf("=");
    if (eq <= 0) continue;
    params[decode(pair.slice(0, eq))] = decode(pair.slice(eq + 1));
  }
  if (params.error || params.state !== expectedState || !params.id_token) return null;
  return { idToken: params.id_token, authorizationCode: params.code || undefined };
}
