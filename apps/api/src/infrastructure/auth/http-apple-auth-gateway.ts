// infrastructure/auth — AppleAuthGateway の実体（appleid.apple.com の token/revoke API）。
// client secret は .p8 秘密鍵（ES256）で署名した短命 JWT（Apple の仕様）。
// ⚠️ token/revoke の呼び出しはネットワークが要るため Unit テスト対象外。
//    client secret の組み立て(buildAppleClientSecret)だけ純粋関数として切り出しテストする。

import { importPKCS8, SignJWT } from "jose";
import type { AppleAuthGateway } from "../../domain/auth/apple-auth-gateway";

const APPLE_TOKEN_URL = "https://appleid.apple.com/auth/token";
const APPLE_REVOKE_URL = "https://appleid.apple.com/auth/revoke";
const APPLE_AUD = "https://appleid.apple.com";

export interface AppleKeyConfig {
  /** Apple Developer の Team ID（client secret の iss）。 */
  teamId: string;
  /** Sign in with Apple 用キーの Key ID（JWT ヘッダの kid）。 */
  keyId: string;
  /** .p8 の中身（PKCS#8 PEM。Secret で渡す）。 */
  privateKey: string;
  /** 失効時に試す client_id 候補（Bundle ID / Services ID。refresh token が
   *  どちらのクライアントで発行されたかを persistence に持たないため、順に試す）。 */
  clientIds: string[];
}

/** Apple の client secret（ES256 署名の短命 JWT）を作る。 */
export async function buildAppleClientSecret(
  config: { teamId: string; keyId: string; privateKey: string },
  clientId: string,
  now: Date = new Date(),
): Promise<string> {
  const key = await importPKCS8(config.privateKey, "ES256");
  const iat = Math.floor(now.getTime() / 1000);
  return new SignJWT({})
    .setProtectedHeader({ alg: "ES256", kid: config.keyId })
    .setIssuer(config.teamId)
    .setSubject(clientId)
    .setAudience(APPLE_AUD)
    .setIssuedAt(iat)
    .setExpirationTime(iat + 5 * 60) // 短命（このリクエストのためだけ）
    .sign(key);
}

export class HttpAppleAuthGateway implements AppleAuthGateway {
  constructor(private readonly config: AppleKeyConfig) {}

  async exchangeCode(code: string, clientId: string): Promise<string | null> {
    const clientSecret = await buildAppleClientSecret(this.config, clientId);
    const res = await fetch(APPLE_TOKEN_URL, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code,
        client_id: clientId,
        client_secret: clientSecret,
      }),
    });
    if (!res.ok) return null;
    const data = (await res.json().catch(() => null)) as { refresh_token?: unknown } | null;
    return typeof data?.refresh_token === "string" ? data.refresh_token : null;
  }

  async revokeToken(refreshToken: string): Promise<void> {
    // refresh token の発行元 client を保存していないため、許可済み client_id を順に試す
    // （高々2件・退会時のみ）。成功したら打ち切り。全滅でも例外にしない（ベストエフォート）。
    for (const clientId of this.config.clientIds) {
      const clientSecret = await buildAppleClientSecret(this.config, clientId);
      const res = await fetch(APPLE_REVOKE_URL, {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          client_id: clientId,
          client_secret: clientSecret,
          token: refreshToken,
          token_type_hint: "refresh_token",
        }),
      });
      if (res.ok) return;
    }
  }
}
