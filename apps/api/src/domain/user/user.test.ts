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
  it("枠が残っていれば解析できる", () => {
    expect(userAt("free", 0).canAnalyze(NOW)).toBe(true);
    expect(userAt("free", MONTHLY_CALL_QUOTA.free - 1).canAnalyze(NOW)).toBe(true);
  });

  it("枠を使い切ると解析できない", () => {
    expect(userAt("free", MONTHLY_CALL_QUOTA.free).canAnalyze(NOW)).toBe(false);
  });

  it("プランごとに上限が異なる（free<next<pro）", () => {
    expect(userAt("next", MONTHLY_CALL_QUOTA.free).canAnalyze(NOW)).toBe(true); // free上限でもnextは余裕
    expect(userAt("pro", MONTHLY_CALL_QUOTA.next).canAnalyze(NOW)).toBe(true);
    expect(monthlyCallQuota("pro")).toBe(320);
  });

  it("月境界を過ぎたらカウントがリセットされ再び解析できる", () => {
    const user = userAt("free", MONTHLY_CALL_QUOTA.free); // 使い切り
    const nextMonth = new Date("2026-07-01T00:00:00.000Z");
    expect(user.canAnalyze(nextMonth)).toBe(true);
    expect(user.analysisCountThisMonth).toBe(0);
    expect(user.countResetAt).toEqual(new Date("2026-08-01T00:00:00.000Z"));
  });
});

describe("User.recordGeminiCalls（成功時のみ実呼び出し数を加算）", () => {
  it("呼び出した回数だけ加算される", () => {
    const user = userAt("free", 0);
    user.recordGeminiCalls(NOW, 5);
    user.recordGeminiCalls(NOW, 4);
    expect(user.analysisCountThisMonth).toBe(9);
    expect(user.remainingCalls(NOW)).toBe(MONTHLY_CALL_QUOTA.free - 9);
  });

  it("月をまたいだ最初の加算はリセット後の値になる", () => {
    const user = userAt("free", MONTHLY_CALL_QUOTA.free);
    user.recordGeminiCalls(new Date("2026-07-15T00:00:00.000Z"), 8);
    expect(user.analysisCountThisMonth).toBe(8);
  });
});

describe("privateKifuLimit（非公開の保存上限）", () => {
  it("free は 4、有料は無制限(null)", () => {
    expect(privateKifuLimit("free")).toBe(4);
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
