// ============================================================
// application — AuthenticateWithReviewCode ユースケース
// ------------------------------------------------------------
// ストア審査用の合言葉ログイン（docs/plans/review-login.md 案B）。
// 合言葉（Secret）が一致したときだけ、固定の合成 sub に紐づく審査ユーザーへ
// find-or-create でログインする。任意ユーザーに入るバックドアではなく
// 「審査用の1ユーザー専用の合鍵」。Secret 未設定ならルートが 501 で閉じる。
// ============================================================

import type { SessionService } from "../domain/auth/session";
import { timingSafeEqual } from "../domain/auth/timing-safe-equal";
import { User } from "../domain/user/user";
import type { UserRepository } from "../domain/user/user.repository";
import { findOrCreateUser } from "./provision-user";

/** 審査ユーザーの合成 sub。Google の実 sub は数字列なのでこの形式とは衝突しない。 */
export const REVIEW_LOGIN_SUB = "review:store";

export interface AuthenticateWithReviewCodeDeps {
  users: UserRepository;
  session: SessionService;
  now: () => Date;
  newId: () => string;
  /** 初回プロフィールのランダムな handle 素。HANDLE_RE を満たす英数字。 */
  randomHandle: () => string;
  /** 照合する合言葉（Env の REVIEW_LOGIN_SECRET）。空なら常に失敗＝口が開かない。 */
  secret: string;
}

export interface AuthenticateWithReviewCodeResult {
  user: User;
  sessionToken: string;
  /** 既存ユーザーは false、初回ログインで作成したら true。 */
  created: boolean;
}

export class AuthenticateWithReviewCode {
  constructor(private readonly deps: AuthenticateWithReviewCodeDeps) {}

  async execute(params: { code: string }): Promise<AuthenticateWithReviewCodeResult> {
    const { users, session, secret } = this.deps;

    if (!secret || !timingSafeEqual(params.code, secret)) {
      throw new Error("review code mismatch");
    }

    const { user, created } = await findOrCreateUser(
      this.deps,
      () => users.findByGoogleSub(REVIEW_LOGIN_SUB),
      { googleSub: REVIEW_LOGIN_SUB, email: null },
    );
    if (created) await users.save(user);

    const sessionToken = await session.issue(user.id);
    return { user, sessionToken, created };
  }
}
