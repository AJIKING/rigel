// クライアントエラー計測（Crashlytics）の文脈語彙。**固定語彙のみ**を型で強制し、
// 自由文字列（PII 混入経路）を締め出す（ANALYTICS_EVENTS と同じ流儀）。
// Plan: docs/plans/crashlytics.md

import { describe, expect, it } from "vitest";
import { CRASH_OPS, CRASH_SCREENS, type CrashContext } from "./crash";

describe("crash 文脈の固定語彙（web/mobile 共通の定義）", () => {
  it("語彙は固定（増減はこのスナップショットの更新＝レビューを必ず通す）", () => {
    expect(CRASH_SCREENS).toEqual(["capture", "problem_edit", "game_detail", "login", "settings"]);
    expect(CRASH_OPS).toEqual([
      "analyze",
      "problem_analyze",
      "retry_analysis",
      "create_kifu",
      "google_sign_in",
      "apple_sign_in",
      "purchase",
      "restore_purchases",
      "billing_portal",
      "purchases_login",
      "purchases_logout",
    ]);
  });

  it("自由文字列はコンパイルエラーになる（PII 混入経路を型で塞ぐ）", () => {
    // @ts-expect-error screen は固定語彙のみ（メールアドレス等を入れられない）
    const badScreen: CrashContext = { screen: "user@example.com", op: "analyze" };
    // @ts-expect-error op も固定語彙のみ
    const badOp: CrashContext = { screen: "capture", op: "何か自由な文字列" };
    const ok: CrashContext = { screen: "capture", op: "analyze" };
    expect([badScreen, badOp, ok]).toHaveLength(3);
  });
});
