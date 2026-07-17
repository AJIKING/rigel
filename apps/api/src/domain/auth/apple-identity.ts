// domain/auth — Apple で検証済みのアイデンティティ（OIDC の sub を真実源にする）。

export interface AppleIdentity {
  /** Apple アカウントの一意ID（OIDC の sub。チーム単位で安定）。users.apple_sub に対応。 */
  sub: string;
  /** メール（初回認可時のみ入ることが多い。Hide My Email の私書箱アドレスもあり得る）。 */
  email: string | null;
  /** idToken の aud（アプリ=Bundle ID / web=Services ID）。
   *  authorizationCode の交換時に client_id として使う。 */
  aud: string;
}
