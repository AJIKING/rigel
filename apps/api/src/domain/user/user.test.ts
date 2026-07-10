import { describe, expect, it } from "vitest";
import {
  MONTHLY_CALL_QUOTA,
  User,
  firstOfNextMonthUtc,
  monthlyCallQuota,
  privateKifuLimit,
} from "./user";

const NOW = new Date("2026-06-28T00:00:00.000Z");

function userAt(plan: "free" | "next" | "pro", count: number): User {
  return new User({
    id: "u1",
    googleSub: "g1",
    plan,
    analysisCountThisMonth: count,
    countResetAt: firstOfNextMonthUtc(NOW), // 2026-07-01
  });
}

describe("User.canAnalyze（呼び出し枠の判定）", () => {
  it("Free は AI再現なし（枠0で常に解析不可）", () => {
    expect(monthlyCallQuota("free")).toBe(0);
    expect(userAt("free", 0).canAnalyze(NOW)).toBe(false);
  });

  it("有料は枠が残っていれば解析できる", () => {
    expect(userAt("next", 0).canAnalyze(NOW)).toBe(true);
    expect(userAt("next", MONTHLY_CALL_QUOTA.next - 1).canAnalyze(NOW)).toBe(true);
  });

  it("枠を使い切ると解析できない", () => {
    expect(userAt("next", MONTHLY_CALL_QUOTA.next).canAnalyze(NOW)).toBe(false);
  });

  it("プランごとに上限が異なる（next<pro）", () => {
    expect(userAt("pro", MONTHLY_CALL_QUOTA.next).canAnalyze(NOW)).toBe(true); // next上限でもproは余裕
    expect(monthlyCallQuota("next")).toBe(100);
    expect(monthlyCallQuota("pro")).toBe(320);
  });

  it("月境界を過ぎたらカウントがリセットされ再び解析できる（有料）", () => {
    const user = userAt("next", MONTHLY_CALL_QUOTA.next); // 使い切り
    const nextMonth = new Date("2026-07-01T00:00:00.000Z");
    expect(user.canAnalyze(nextMonth)).toBe(true);
    expect(user.analysisCountThisMonth).toBe(0);
    expect(user.countResetAt).toEqual(new Date("2026-08-01T00:00:00.000Z"));
  });
});

describe("User.recordGeminiCalls（成功時のみ実呼び出し数を加算）", () => {
  it("呼び出した回数だけ加算される（有料）", () => {
    const user = userAt("next", 0);
    user.recordGeminiCalls(NOW, 5);
    user.recordGeminiCalls(NOW, 4);
    expect(user.analysisCountThisMonth).toBe(9);
    expect(user.remainingCalls(NOW)).toBe(MONTHLY_CALL_QUOTA.next - 9);
  });

  it("月をまたいだ最初の加算はリセット後の値になる", () => {
    const user = userAt("next", MONTHLY_CALL_QUOTA.next);
    user.recordGeminiCalls(new Date("2026-07-15T00:00:00.000Z"), 8);
    expect(user.analysisCountThisMonth).toBe(8);
  });
});

describe("User.changePlan（購入経路 store の記録）", () => {
  it("有料化で購入経路を記録し、free へ落とすとクリアされる", () => {
    const user = User.create({ id: "u1", googleSub: "g1", now: NOW });
    expect(user.planStore).toBeNull();

    user.changePlan("next", "APP_STORE");
    expect(user.planStore).toBe("APP_STORE");
    expect(user.toProps().planStore).toBe("APP_STORE");

    user.changePlan("free");
    expect(user.planStore).toBeNull();
  });

  it("store 省略の有料化は経路不明（null）として記録する", () => {
    const user = User.create({ id: "u1", googleSub: "g1", now: NOW });
    user.changePlan("pro");
    expect(user.plan).toBe("pro");
    expect(user.planStore).toBeNull();
  });
});

describe("privateKifuLimit（非公開の保存上限）", () => {
  it("free は 5、有料は無制限(null)", () => {
    expect(privateKifuLimit("free")).toBe(5);
    expect(privateKifuLimit("next")).toBeNull();
    expect(privateKifuLimit("pro")).toBeNull();
  });
});

describe("firstOfNextMonthUtc", () => {
  it("12月は翌年1月へ繰り上がる", () => {
    expect(firstOfNextMonthUtc(new Date("2026-12-10T00:00:00.000Z"))).toEqual(
      new Date("2027-01-01T00:00:00.000Z"),
    );
  });
});
