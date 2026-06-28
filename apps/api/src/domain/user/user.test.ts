import { describe, expect, it } from "vitest";
import { FREE_MONTHLY_QUOTA, User, firstOfNextMonthUtc } from "./user";

const NOW = new Date("2026-06-28T00:00:00.000Z");

function freeUser(count: number): User {
  return new User({
    id: "u1",
    googleSub: "g1",
    plan: "free",
    analysisCountThisMonth: count,
    countResetAt: firstOfNextMonthUtc(NOW), // 2026-07-01
  });
}

describe("User.canAnalyze（無料枠の判定）", () => {
  it("無料ユーザーは残枠があれば解析できる", () => {
    expect(freeUser(0).canAnalyze(NOW)).toBe(true);
    expect(freeUser(FREE_MONTHLY_QUOTA - 1).canAnalyze(NOW)).toBe(true);
  });

  it("無料ユーザーは枠を使い切ると解析できない", () => {
    expect(freeUser(FREE_MONTHLY_QUOTA).canAnalyze(NOW)).toBe(false);
  });

  it("有料ユーザーは枠を超えても常に解析できる", () => {
    const paid = new User({
      id: "u2",
      googleSub: "g2",
      plan: "paid",
      analysisCountThisMonth: 9999,
      countResetAt: firstOfNextMonthUtc(NOW),
    });
    expect(paid.canAnalyze(NOW)).toBe(true);
  });

  it("月境界を過ぎたらカウントがリセットされ再び解析できる", () => {
    const user = freeUser(FREE_MONTHLY_QUOTA); // 使い切り
    const nextMonth = new Date("2026-07-01T00:00:00.000Z");
    expect(user.canAnalyze(nextMonth)).toBe(true);
    expect(user.analysisCountThisMonth).toBe(0);
    expect(user.countResetAt).toEqual(new Date("2026-08-01T00:00:00.000Z"));
  });
});

describe("User.recordSuccessfulAnalysis（成功時のみ加算）", () => {
  it("呼ぶたびにカウントが +1 される", () => {
    const user = freeUser(0);
    user.recordSuccessfulAnalysis(NOW);
    user.recordSuccessfulAnalysis(NOW);
    expect(user.analysisCountThisMonth).toBe(2);
  });

  it("月をまたいだ最初の加算はリセット後の 1 になる", () => {
    const user = freeUser(FREE_MONTHLY_QUOTA);
    user.recordSuccessfulAnalysis(new Date("2026-07-15T00:00:00.000Z"));
    expect(user.analysisCountThisMonth).toBe(1);
  });
});

describe("firstOfNextMonthUtc", () => {
  it("12月は翌年1月へ繰り上がる", () => {
    expect(firstOfNextMonthUtc(new Date("2026-12-10T00:00:00.000Z"))).toEqual(
      new Date("2027-01-01T00:00:00.000Z"),
    );
  });
});
