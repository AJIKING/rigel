// domain/auth — Google で検証済みのアイデンティティ（OIDC の sub を真実源にする）。

export interface GoogleIdentity {
  /** Google アカウントの一意ID（OIDC の sub）。users.google_sub に対応。 */
  sub: string;
  /** メール（取得できれば。なければ null）。 */
  email: string | null;
  /** 表示名（Google プロフィールの name。取得できれば。なければ null）。初回の既定表示名に使う。 */
  name: string | null;
}
