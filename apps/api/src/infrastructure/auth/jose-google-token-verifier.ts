// infrastructure/auth — GoogleTokenVerifier の実体（jose + Google JWKS）。
// 検証の芯（JWKS・iss・aud・RS256 固定）は oidc.ts の共通素材。ここはクレームの写像だけ。
// ⚠️ ネットワーク(JWKS取得)が要るため Unit テスト対象外。ユースケースは fake verifier でテストする。

import type { JWTPayload } from "jose";
import type { GoogleIdentity } from "../../domain/auth/google-identity";
import type { GoogleTokenVerifier } from "../../domain/auth/google-token-verifier";
import { createIdTokenVerifier, parseAudiences } from "./oidc";

const GOOGLE_JWKS_URL = "https://www.googleapis.com/oauth2/v3/certs";
const GOOGLE_ISSUERS = ["https://accounts.google.com", "accounts.google.com"];

export class JoseGoogleTokenVerifier implements GoogleTokenVerifier {
  private readonly verifyIdToken: (idToken: string) => Promise<JWTPayload>;

  /** clientId は Google OAuth クライアントID（複数可・カンマ区切り。aud 検証に使う）。 */
  constructor(clientId: string) {
    this.verifyIdToken = createIdTokenVerifier({
      jwksUrl: GOOGLE_JWKS_URL,
      issuer: GOOGLE_ISSUERS,
      audiences: parseAudiences(clientId),
    });
  }

  async verify(idToken: string): Promise<GoogleIdentity> {
    const payload = await this.verifyIdToken(idToken);
    if (!payload.sub) {
      throw new Error("Google ID トークンに sub がありません");
    }
    const email = typeof payload.email === "string" ? payload.email : null;
    const name = typeof payload.name === "string" ? payload.name : null;
    return { sub: payload.sub, email, name };
  }
}
