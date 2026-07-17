// infrastructure/auth — AppleTokenVerifier の実体（jose + Apple JWKS）。
// 検証の芯（JWKS・iss・aud・RS256 固定）は oidc.ts の共通素材。ここはクレームの写像だけ。
// ⚠️ ネットワーク(JWKS取得)が要るため Unit テスト対象外。ユースケースは fake verifier でテストする。

import type { JWTPayload } from "jose";
import type { AppleIdentity } from "../../domain/auth/apple-identity";
import type { AppleTokenVerifier } from "../../domain/auth/apple-token-verifier";
import { createIdTokenVerifier, parseAudiences } from "./oidc";

const APPLE_JWKS_URL = "https://appleid.apple.com/auth/keys";
const APPLE_ISSUER = "https://appleid.apple.com";

export class JoseAppleTokenVerifier implements AppleTokenVerifier {
  private readonly audiences: string[];
  private readonly verifyIdToken: (idToken: string) => Promise<JWTPayload>;

  /** clientId は許可する aud（アプリ=Bundle ID / web=Services ID。カンマ区切りで複数可）。 */
  constructor(clientId: string) {
    this.audiences = parseAudiences(clientId);
    this.verifyIdToken = createIdTokenVerifier({
      jwksUrl: APPLE_JWKS_URL,
      issuer: APPLE_ISSUER,
      audiences: this.audiences,
    });
  }

  async verify(idToken: string): Promise<AppleIdentity> {
    const payload = await this.verifyIdToken(idToken);
    if (!payload.sub) {
      throw new Error("Apple ID トークンに sub がありません");
    }
    // aud は許可リストに含まれるものを選ぶ（配列 aud の先頭が許可外という理論ケースを排除。
    // この値は authorizationCode 交換の client_id に使うため、許可済みの値であることが重要）。
    const audClaims = Array.isArray(payload.aud) ? payload.aud : payload.aud ? [payload.aud] : [];
    const aud = audClaims.find((a) => this.audiences.includes(a));
    if (!aud) {
      throw new Error("Apple ID トークンの aud が許可リストにありません");
    }
    const email = typeof payload.email === "string" ? payload.email : null;
    return { sub: payload.sub, email, aud };
  }
}
