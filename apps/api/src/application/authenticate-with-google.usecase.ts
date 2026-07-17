// ============================================================
// application — AuthenticateWithGoogle ユースケース
// ------------------------------------------------------------
// Google ID トークンを検証し、ユーザーを find-or-create して、
// 自前のセッショントークンを発行する。ポートだけに依存する。
// find-or-create（ランダムプロフィール付与）は provision-user に集約（Apple と共用）。
// ============================================================

import type { GoogleTokenVerifier } from "../domain/auth/google-token-verifier";
import type { SessionService } from "../domain/auth/session";
import { User } from "../domain/user/user";
import type { UserRepository } from "../domain/user/user.repository";
import { findOrCreateUser } from "./provision-user";

export interface AuthenticateDeps {
  users: UserRepository;
  verifier: GoogleTokenVerifier;
  session: SessionService;
  now: () => Date;
  newId: () => string;
  /** 初回プロフィールのランダムな handle 素（Google 情報は使わない）。HANDLE_RE を満たす英数字。 */
  randomHandle: () => string;
}

export interface AuthenticateResult {
  user: User;
  sessionToken: string;
  /** 既存ユーザーは false、初回ログインで作成したら true。 */
  created: boolean;
}

export class AuthenticateWithGoogle {
  constructor(private readonly deps: AuthenticateDeps) {}

  async execute(params: { idToken: string }): Promise<AuthenticateResult> {
    const { users, verifier, session } = this.deps;

    const identity = await verifier.verify(params.idToken);

    const { user, created } = await findOrCreateUser(
      this.deps,
      () => users.findByGoogleSub(identity.sub),
      { googleSub: identity.sub, email: identity.email },
    );
    if (created) await users.save(user);

    const sessionToken = await session.issue(user.id);
    return { user, sessionToken, created };
  }
}
