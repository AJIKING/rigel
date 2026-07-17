// infrastructure/user — UserRepository の Drizzle/D1 実装。
// ドメインの User <-> D1 の行(UserRow) の写像はここに閉じ込める。

import { eq } from "drizzle-orm";
import { User } from "../../domain/user/user";
import type { UserRepository } from "../../domain/user/user.repository";
import type { Db } from "../db/client";
import { users, type UserRow } from "../db/schema";

function toDomain(row: UserRow): User {
  return new User({
    id: row.id,
    googleSub: row.googleSub,
    appleSub: row.appleSub,
    appleRefreshToken: row.appleRefreshToken,
    plan: row.plan,
    analysisCountThisMonth: row.analysisCountThisMonth,
    countResetAt: row.countResetAt,
    email: row.email,
    handle: row.handle,
    displayName: row.displayName,
    planStore: row.planStore,
  });
}

export class DrizzleUserRepository implements UserRepository {
  constructor(private readonly db: Db) {}

  async findById(id: string): Promise<User | null> {
    const row = await this.db.select().from(users).where(eq(users.id, id)).get();
    return row ? toDomain(row) : null;
  }

  async findByGoogleSub(googleSub: string): Promise<User | null> {
    const row = await this.db.select().from(users).where(eq(users.googleSub, googleSub)).get();
    return row ? toDomain(row) : null;
  }

  async findByAppleSub(appleSub: string): Promise<User | null> {
    const row = await this.db.select().from(users).where(eq(users.appleSub, appleSub)).get();
    return row ? toDomain(row) : null;
  }

  async findByHandle(handle: string): Promise<User | null> {
    const row = await this.db.select().from(users).where(eq(users.handle, handle)).get();
    return row ? toDomain(row) : null;
  }

  async save(user: User): Promise<void> {
    const p = user.toProps();
    const values = {
      id: p.id,
      googleSub: p.googleSub,
      appleSub: p.appleSub,
      appleRefreshToken: p.appleRefreshToken,
      email: p.email,
      plan: p.plan,
      planStore: p.planStore,
      handle: p.handle,
      displayName: p.displayName,
      analysisCountThisMonth: p.analysisCountThisMonth,
      countResetAt: p.countResetAt,
    };
    await this.db
      .insert(users)
      .values(values)
      .onConflictDoUpdate({
        target: users.id,
        set: {
          // 再サインインで refresh token が更新される（sub は不変なので set に含めない）。
          appleRefreshToken: p.appleRefreshToken,
          email: p.email,
          plan: p.plan,
          planStore: p.planStore,
          handle: p.handle,
          displayName: p.displayName,
          analysisCountThisMonth: p.analysisCountThisMonth,
          countResetAt: p.countResetAt,
        },
      });
  }

  async deleteById(id: string): Promise<void> {
    await this.db.delete(users).where(eq(users.id, id));
  }
}
