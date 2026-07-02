// ============================================================
// application — AuthenticateWithGoogle ユースケース
// ------------------------------------------------------------
// Google ID トークンを検証し、ユーザーを find-or-create して、
// 自前のセッショントークンを発行する。ポートだけに依存する。
// ============================================================

import type { GoogleTokenVerifier } from "../domain/auth/google-token-verifier";
import type { SessionService } from "../domain/auth/session";
import { defaultDisplayName, defaultHandleBase } from "../domain/user/default-profile";
import { User } from "../domain/user/user";
import type { UserRepository } from "../domain/user/user.repository";

/** base をもとに未使用の handle を作る（重複なら連番を足す。20文字上限を守る）。 */
async function uniqueHandle(users: UserRepository, base: string): Promise<string> {
  if (!(await users.findByHandle(base))) return base;
  for (let i = 2; i < 10000; i++) {
    const suffix = String(i);
    const candidate = `${base.slice(0, 20 - suffix.length)}${suffix}`;
    if (!(await users.findByHandle(candidate))) return candidate;
  }
  // 事実上到達しない。念のため id ベースで返す（呼び出し側で id は一意）。
  return base.slice(0, 12);
}

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
      // 初回は表示名と公開ID(handle)に既定値を入れておく（設定画面に出す）。handle は一意化する。
      const handle = await uniqueHandle(users, defaultHandleBase(identity));
      user = User.create({
        id: newId(),
        googleSub: identity.sub,
        now: now(),
        displayName: defaultDisplayName(identity),
        handle,
      });
      await users.save(user);
      created = true;
    }

    const sessionToken = await session.issue(user.id);
    return { user, sessionToken, created };
  }
}
