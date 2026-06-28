// ============================================================
// application — AuthenticateWithGoogle ユースケース
// ------------------------------------------------------------
// Google ID トークンを検証し、ユーザーを find-or-create して、
// 自前のセッショントークンを発行する。ポートだけに依存する。
// ============================================================

import type { GoogleTokenVerifier } from "../domain/auth/google-token-verifier";
import type { SessionService } from "../domain/auth/session";
import { User } from "../domain/user/user";
import type { UserRepository } from "../domain/user/user.repository";

export interface AuthenticateDeps {
  users: UserRepository;
  verifier: GoogleTokenVerifier;
  session: SessionService;
  now: () => Date;
  newId: () => string;
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
    const { users, verifier, session, now, newId } = this.deps;

    const identity = await verifier.verify(params.idToken);

    let user = await users.findByGoogleSub(identity.sub);
    let created = false;
    if (!user) {
      user = User.create({ id: newId(), googleSub: identity.sub, now: now() });
      await users.save(user);
      created = true;
    }

    const sessionToken = await session.issue(user.id);
    return { user, sessionToken, created };
  }
}
