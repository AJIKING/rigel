// infrastructure/auth — GoogleTokenVerifier の実体（jose + Google JWKS）。
// Google の公開鍵で ID トークンの署名・iss・aud を検証する。
// ⚠️ ネットワーク(JWKS取得)が要るため Unit テスト対象外。ユースケースは fake verifier でテストする。

import { createRemoteJWKSet, jwtVerify } from "jose";
import type { GoogleIdentity } from "../../domain/auth/google-identity";
import type { GoogleTokenVerifier } from "../../domain/auth/google-token-verifier";

const GOOGLE_JWKS_URL = "https://www.googleapis.com/oauth2/v3/certs";
const GOOGLE_ISSUERS = ["https://accounts.google.com", "accounts.google.com"];

/**
 * 許可する Google OAuth クライアントID群を得る。web/iOS/Android で別クライアントIDを使うため、
 * `GOOGLE_CLIENT_ID` はカンマ区切りで複数指定できる（id_token の aud がどれか1つに一致すればOK）。
 */
export function parseAudiences(value: string): string[] {
  return value
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

export class JoseGoogleTokenVerifier implements GoogleTokenVerifier {
  private readonly jwks = createRemoteJWKSet(new URL(GOOGLE_JWKS_URL));
  private readonly audiences: string[];

  /** clientId は Google OAuth クライアントID（複数可・カンマ区切り。aud 検証に使う）。 */
  constructor(clientId: string) {
    this.audiences = parseAudiences(clientId);
  }

  async verify(idToken: string): Promise<GoogleIdentity> {
    const { payload } = await jwtVerify(idToken, this.jwks, {
      issuer: GOOGLE_ISSUERS,
      // aud が許可クライアントIDのいずれかに一致すればOK（web/iOS/Android 共通の api）。
      audience: this.audiences,
    });
    if (!payload.sub) {
      throw new Error("Google ID トークンに sub がありません");
    }
    const email = typeof payload.email === "string" ? payload.email : null;
    const name = typeof payload.name === "string" ? payload.name : null;
    return { sub: payload.sub, email, name };
  }
}
