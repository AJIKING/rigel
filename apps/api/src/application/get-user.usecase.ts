// application — GetUser ユースケース（認証済みユーザー自身の取得 = /me）。

import type { User } from "../domain/user/user";
import type { UserRepository } from "../domain/user/user.repository";

export class GetUser {
  constructor(private readonly users: UserRepository) {}

  execute(id: string): Promise<User | null> {
    return this.users.findById(id);
  }
}
