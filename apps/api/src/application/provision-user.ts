// ============================================================
// application — 初回ログイン時のユーザー付与（Google/Apple 認証で共用）
// ------------------------------------------------------------
// プロバイダの sub でユーザーを検索し、いなければランダムプロフィールで作成する。
// 表示名・公開ID(handle)はプロバイダ情報（名前/メール）を使わない（プライバシー方針）。
// email は運用（緊急時・不正アカウント調査）のためだけに保存する（API には出さない）。
// ============================================================

import { User } from "../domain/user/user";
import type { UserRepository } from "../domain/user/user.repository";

/** base をもとに未使用の handle を作る（重複なら連番を足す。20文字上限を守る）。 */
export async function uniqueHandle(users: UserRepository, base: string): Promise<string> {
  if (!(await users.findByHandle(base))) return base;
  for (let i = 2; i < 10000; i++) {
    const suffix = String(i);
    const candidate = `${base.slice(0, 20 - suffix.length)}${suffix}`;
    if (!(await users.findByHandle(candidate))) return candidate;
  }
  // 事実上到達しない。念のため id ベースで返す（呼び出し側で id は一意）。
  return base.slice(0, 12);
}

export interface ProvisionUserDeps {
  users: UserRepository;
  now: () => Date;
  newId: () => string;
  /** 初回プロフィールのランダムな handle 素。HANDLE_RE を満たす英数字。 */
  randomHandle: () => string;
}

/**
 * find で既存ユーザーを探し、いなければ identity の sub を紐付けた新規ユーザーを作る。
 * 作成したユーザーの保存（save）は呼び出し側の責務（プロバイダ固有の後処理と一緒に保存する）。
 */
export async function findOrCreateUser(
  deps: ProvisionUserDeps,
  find: () => Promise<User | null>,
  identity: { googleSub?: string | null; appleSub?: string | null; email: string | null },
): Promise<{ user: User; created: boolean }> {
  const existing = await find();
  if (existing) return { user: existing, created: false };

  const handle = await uniqueHandle(deps.users, deps.randomHandle());
  const user = User.create({
    id: deps.newId(),
    googleSub: identity.googleSub ?? null,
    appleSub: identity.appleSub ?? null,
    now: deps.now(),
    email: identity.email,
    displayName: handle,
    handle,
  });
  return { user, created: true };
}
