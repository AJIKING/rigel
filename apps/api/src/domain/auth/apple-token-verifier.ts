// domain/auth — Apple ID トークン検証のポート。
// 実体(jose + Apple JWKS)は infrastructure 層。テストではフェイクを差す。

import type { AppleIdentity } from "./apple-identity";

export interface AppleTokenVerifier {
  /** Apple の ID トークン(JWT)を検証し、検証済みアイデンティティを返す。失敗時は例外。 */
  verify(idToken: string): Promise<AppleIdentity>;
}
