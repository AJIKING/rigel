// infrastructure/auth — OIDC ID トークン検証の共通素材（Google/Apple の検証器で共用）。
// 署名鍵(JWKS)・発行者(iss)・許可 aud・署名アルゴリズム固定という「検証の芯」を
// 1か所に集め、プロバイダごとの差はクレームの写像だけにする。

import { createRemoteJWKSet, jwtVerify, type JWTPayload } from "jose";

/**
 * 許可する OAuth クライアントID群を得る。web/iOS/Android で別クライアントIDを使うため、
 * 環境変数はカンマ区切りで複数指定できる（id_token の aud がどれか1つに一致すればOK）。
 */
export function parseAudiences(value: string): string[] {
  return value
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

/** JWKS・iss・aud・RS256 を固定した ID トークン検証器を作る（検証済み payload を返す）。 */
export function createIdTokenVerifier(config: {
  jwksUrl: string;
  issuer: string | string[];
  audiences: string[];
}): (idToken: string) => Promise<JWTPayload> {
  const jwks = createRemoteJWKSet(new URL(config.jwksUrl));
  return async (idToken) => {
    const { payload } = await jwtVerify(idToken, jwks, {
      issuer: config.issuer,
      audience: config.audiences,
      // 署名アルゴリズムを固定する（Google/Apple の公開鍵は RS256。防御的に明示）。
      algorithms: ["RS256"],
    });
    return payload;
  };
}
