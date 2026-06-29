// domain/user — リポジトリのポート（インターフェース）。
// 実体(Drizzle/D1)は infrastructure 層に置き、ドメイン/アプリ層はこの契約だけに依存する。

import type { User } from "./user";

export interface UserRepository {
  findById(id: string): Promise<User | null>;
  findByGoogleSub(googleSub: string): Promise<User | null>;
  /** 公開ハンドルで検索（別ユーザーページ用）。 */
  findByHandle(handle: string): Promise<User | null>;
  /** 新規作成・更新の両方（upsert）。 */
  save(user: User): Promise<void>;
  /** アカウント削除（ユーザー行）。 */
  deleteById(id: string): Promise<void>;
}
