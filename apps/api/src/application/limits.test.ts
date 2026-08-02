// プラン上限チェックの共通ヘルパの直接テスト。
// 2026-08-01 の品質調査で「フェイルセーフ（ユーザー不在→超過扱い）と無制限分岐が
// 直接検証されていない」と指摘された穴を塞ぐ（課金・保存上限のゲート）。

import { describe, expect, it, vi } from "vitest";
import { User } from "../domain/user/user";
import { InMemoryUserRepository } from "../test-support/in-memory";
import { isOverLimit, isOverLimitForPlan } from "./limits";

const NOW = new Date("2026-08-02T00:00:00.000Z");

describe("isOverLimitForPlan", () => {
  it("limit=null は無制限（count を評価すらしない＝無駄な集計を避ける）", async () => {
    const count = vi.fn(() => Promise.resolve(999));
    expect(await isOverLimitForPlan("pro", () => null, count)).toBe(false);
    expect(count).not.toHaveBeenCalled();
  });

  it("上限ちょうどで超過扱い（>= 判定。free5 の6件目を作らせない）", async () => {
    expect(
      await isOverLimitForPlan(
        "free",
        () => 5,
        () => Promise.resolve(4),
      ),
    ).toBe(false);
    expect(
      await isOverLimitForPlan(
        "free",
        () => 5,
        () => Promise.resolve(5),
      ),
    ).toBe(true);
  });
});

describe("isOverLimit", () => {
  it("ユーザー不在は超過扱い（安全側フェイルセーフ。作成を許さない）", async () => {
    const users = new InMemoryUserRepository();
    expect(
      await isOverLimit(
        users,
        "missing",
        () => 5,
        () => Promise.resolve(0),
      ),
    ).toBe(true);
  });

  it("ユーザーのプランで上限を引く", async () => {
    const users = new InMemoryUserRepository([User.create({ id: "u1", googleSub: "g", now: NOW })]);
    const limitOf = vi.fn((plan: string) => (plan === "free" ? 1 : null));

    expect(await isOverLimit(users, "u1", limitOf, () => Promise.resolve(1))).toBe(true);
    expect(limitOf).toHaveBeenCalledWith("free");
  });
});
