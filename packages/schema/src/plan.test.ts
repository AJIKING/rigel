// プラン上限ポリシー（背骨の一部）。
// これまで api(domain/user) と @rigel/ui で二重定義し「一致させる」コメントで
// 手動同期していた課金・保存上限の定数を、schema に一元化して drift を構造的に防ぐ。
// 値は課金整合そのもの（free0/next100/pro320・非公開free5・下書きfree5・30局・16局番号・特訓1日3回）。
// この値を変えるときは料金プランの変更であり、設計ドキュメントの更新を伴う。

import { describe, expect, it } from "vitest";
import {
  DRAFT_KIFU_LIMIT,
  FREE_QUIZ_PER_DAY,
  MAX_LOGS_PER_GAME,
  MAX_SEQ,
  MONTHLY_CALL_QUOTA,
  PLAN_VALUES,
  PaidPlanSchema,
  PlanSchema,
  PRIVATE_KIFU_LIMIT,
  PROBLEM_LIMIT,
} from "./index";

describe("PlanSchema（プラン識別子）", () => {
  it.each([["free"], ["next"], ["pro"]])("%s を受理する", (plan) => {
    expect(PlanSchema.parse(plan)).toBe(plan);
  });

  it.each([["premium"], [""], [null], [123], ["Free"]])("%o は拒否する", (plan) => {
    expect(PlanSchema.safeParse(plan).success).toBe(false);
  });

  it("PLAN_VALUES は free/next/pro の3プラン（UI の列挙・Record キーの真実源）", () => {
    expect(PLAN_VALUES).toEqual(["free", "next", "pro"]);
  });
});

describe("PaidPlanSchema（有料プラン識別子）", () => {
  it.each([["next"], ["pro"]])("%s を受理する", (plan) => {
    expect(PaidPlanSchema.parse(plan)).toBe(plan);
  });

  it("free は有料プランではないので拒否する", () => {
    expect(PaidPlanSchema.safeParse("free").success).toBe(false);
  });
});

describe("MONTHLY_CALL_QUOTA（月間 Gemini 呼び出し枠。課金の中心値）", () => {
  it.each([
    { plan: "free", quota: 0, why: "Free は AI再現なし（枠0）" },
    { plan: "next", quota: 100, why: "Next は月100回" },
    { plan: "pro", quota: 320, why: "Pro は月320回" },
  ] as const)("$plan は $quota（$why）", ({ plan, quota }) => {
    expect(MONTHLY_CALL_QUOTA[plan]).toBe(quota);
  });
});

describe("保存上限（半荘単位。null=無制限）", () => {
  it("非公開(complete)は free=5・有料=無制限", () => {
    expect(PRIVATE_KIFU_LIMIT).toEqual({ free: 5, next: null, pro: null });
  });

  it("下書き(draft)は free=5・有料=無制限（非公開上限とは別枠）", () => {
    expect(DRAFT_KIFU_LIMIT).toEqual({ free: 5, next: null, pro: null });
  });

  it("何切る問題(draft+published 合算)は free=20・有料=無制限", () => {
    expect(PROBLEM_LIMIT).toEqual({ free: 20, next: null, pro: null });
  });
});

describe("半荘の構造上限（全プラン共通）", () => {
  it("1半荘は30局まで", () => {
    expect(MAX_LOGS_PER_GAME).toBe(30);
  });

  it("局番号(seq)は東一局=1〜北四局=16", () => {
    expect(MAX_SEQ).toBe(16);
  });
});

describe("FREE_QUIZ_PER_DAY（特訓クイズの無料枠）", () => {
  it("無料プランは1日3回（JST 0時回復・有料は無制限）", () => {
    expect(FREE_QUIZ_PER_DAY).toBe(3);
  });
});
