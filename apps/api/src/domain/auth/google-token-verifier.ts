// domain/auth — Google ID トークン検証のポート。
// 実体(jose + Google JWKS)は infrastructure 層。テストではフェイクを差す。

import type { GoogleIdentity } from "./google-identity";

export interface GoogleTokenVerifier {
  /** Google の ID トークン(JWT)を検証し、検証済みアイデンティティを返す。失敗時は例外。 */
  verify(idToken: string): Promise<GoogleIdentity>;
}
