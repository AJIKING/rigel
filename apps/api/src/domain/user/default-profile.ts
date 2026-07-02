// domain/user — 初回ログイン時の既定プロフィール（表示名・公開ID）の素を作る純粋関数。
// 一意性の解決（handle の重複回避）はアプリ層（リポジトリ参照が要る）で行う。

import type { GoogleIdentity } from "../auth/google-identity";

/** 表示名の既定: Google 名 → メールのローカル部 → "ユーザー"。 */
export function defaultDisplayName(identity: GoogleIdentity): string {
  const name = identity.name?.trim();
  if (name) return name;
  const local = identity.email?.split("@")[0]?.trim();
  return local && local.length > 0 ? local : "ユーザー";
}

/**
 * 公開ID(handle)の素。メールのローカル部を [a-zA-Z0-9_] に整えて 3〜20 文字にする。
 * 作れなければ "user"。一意化（重複時の連番付け）は呼び出し側で行う。
 * HANDLE_RE = /^[a-zA-Z0-9_]{3,20}$/ を満たす値を返す。
 */
export function defaultHandleBase(identity: GoogleIdentity): string {
  const local = identity.email?.split("@")[0] ?? "";
  const base = local
    .replace(/[^a-zA-Z0-9_]/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "");
  if (base.length < 3) return "user";
  return base.slice(0, 20);
}
