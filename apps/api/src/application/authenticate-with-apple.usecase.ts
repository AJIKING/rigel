// ============================================================
// application — AuthenticateWithApple ユースケース
// ------------------------------------------------------------
// Apple ID トークンを検証し、ユーザーを find-or-create して、
// 自前のセッショントークンを発行する（AuthenticateWithGoogle と対称。
// find-or-create（ランダムプロフィール付与）は provision-user に集約）。
// authorizationCode があれば refresh token に交換して保存する
// （App Store 審査要件: 退会時のトークン失効=revoke に使う。交換はベストエフォート）。
// ============================================================

import type { AppleAuthGateway } from "../domain/auth/apple-auth-gateway";
import type { AppleTokenVerifier } from "../domain/auth/apple-token-verifier";
import type { SessionService } from "../domain/auth/session";
import { User } from "../domain/user/user";
import type { UserRepository } from "../domain/user/user.repository";
import { findOrCreateUser } from "./provision-user";

export interface AuthenticateWithAppleDeps {
  users: UserRepository;
  verifier: AppleTokenVerifier;
  /** トークン交換/失効のゲートウェイ（.p8 鍵未設定の環境では null=スキップ）。 */
  appleAuth: AppleAuthGateway | null;
  session: SessionService;
  now: () => Date;
  newId: () => string;
  /** 初回プロフィールのランダムな handle 素（Apple 情報は使わない）。HANDLE_RE を満たす英数字。 */
  randomHandle: () => string;
}

export interface AuthenticateWithAppleResult {
  user: User;
  sessionToken: string;
  /** 既存ユーザーは false、初回ログインで作成したら true。 */
  created: boolean;
}

export class AuthenticateWithApple {
  constructor(private readonly deps: AuthenticateWithAppleDeps) {}

  async execute(params: {
    idToken: string;
    /** ネイティブ/web の認可レスポンスの authorizationCode（任意。refresh token 交換用）。 */
    authorizationCode?: string;
  }): Promise<AuthenticateWithAppleResult> {
    const { users, verifier, appleAuth, session } = this.deps;

    const identity = await verifier.verify(params.idToken);

    const { user, created } = await findOrCreateUser(
      this.deps,
      () => users.findByAppleSub(identity.sub),
      { appleSub: identity.sub, email: identity.email },
    );

    // 退会時の失効（revoke）に使う refresh token を保存する。client_id は idToken の aud
    // （アプリ=Bundle ID / web=Services ID）。失敗してもログインは成功させる。
    if (params.authorizationCode && appleAuth) {
      const refresh = await appleAuth
        .exchangeCode(params.authorizationCode, identity.aud)
        .catch(() => null);
      if (refresh) user.setAppleRefreshToken(refresh);
    }
    await users.save(user);

    const sessionToken = await session.issue(user.id);
    return { user, sessionToken, created };
  }
}
