// domain/auth — Apple のトークン交換/失効のポート。
// App Store 審査要件: 退会時は Sign in with Apple のトークンを REST API で失効させる
// （TN3194）。失効には refresh token が要るため、サインイン時に authorizationCode を
// 交換して保存しておく。実体（appleid.apple.com + .p8 署名の client secret）は infrastructure 層。

export interface AppleAuthGateway {
  /** authorizationCode を refresh token に交換する（clientId = idToken の aud）。
   *  失敗は null（サインイン自体は続行する＝ベストエフォート）。 */
  exchangeCode(code: string, clientId: string): Promise<string | null>;
  /** 退会時の失効。失敗しても呼び出し側は削除を続行する（ベストエフォート）。 */
  revokeToken(refreshToken: string): Promise<void>;
}
