// infrastructure/auth — GoogleTokenVerifier の実体（jose + Google JWKS）。
// Google の公開鍵で ID トークンの署名・iss・aud を検証する。
// ⚠️ ネットワーク(JWKS取得)が要るため Unit テスト対象外。ユースケースは fake verifier でテストする。

import { createRemoteJWKSet, jwtVerify } from "jose";
import type { GoogleIdentity } from "../../domain/auth/google-identity";
import type { GoogleTokenVerifier } from "../../domain/auth/google-token-verifier";

const GOOGLE_JWKS_URL = "https://www.googleapis.com/oauth2/v3/certs";
const GOOGLE_ISSUERS = ["https://accounts.google.com", "accounts.google.com"];

export class JoseGoogleTokenVerifier implements GoogleTokenVerifier {
  private readonly jwks = createRemoteJWKSet(new URL(GOOGLE_JWKS_URL));

  /** clientId は Google OAuth クライアントID（aud 検証に使う）。 */
  constructor(private readonly clientId: string) {}

  async verify(idToken: string): Promise<GoogleIdentity> {
    const { payload } = await jwtVerify(idToken, this.jwks, {
      issuer: GOOGLE_ISSUERS,
      audience: this.clientId,
    });
    if (!payload.sub) {
      throw new Error("Google ID トークンに sub がありません");
    }
    const email = typeof payload.email === "string" ? payload.email : null;
    return { sub: payload.sub, email };
  }
}
