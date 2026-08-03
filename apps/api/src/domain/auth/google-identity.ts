// domain/auth — Google で検証済みのアイデンティティ（OIDC の sub を真実源にする）。

export interface GoogleIdentity {
  /** Google アカウントの一意ID（OIDC の sub）。users.google_sub に対応。 */
  sub: string;
  /** メール（取得できれば。なければ null）。**運用調査専用**で API には出さない（ルール7-2）。
   *  Google 側で未検証（email_verified=false）のメールは受け取らない（調査精度を落とすため）。 */
  email: string | null;
}
