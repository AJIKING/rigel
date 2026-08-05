// クライアントエラー計測（Crashlytics）に添える文脈の固定語彙。
// ANALYTICS_EVENTS と同じ流儀で **固定語彙のみ**を型で強制し、自由文字列
// （＝PII が混入し得る経路）を締め出す。実送信は apps/mobile/lib/crash.ts。
// Plan: docs/plans/crashlytics.md

/** エラーが起きた画面（モジュール）の語彙。 */
export const CRASH_SCREENS = [
  "capture",
  "problem_edit",
  "game_detail",
  "login",
  "settings",
] as const;
export type CrashScreen = (typeof CRASH_SCREENS)[number];

/** エラーが起きた操作の語彙。 */
export const CRASH_OPS = [
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
] as const;
export type CrashOp = (typeof CRASH_OPS)[number];

/** trackError に添える文脈（これ以外のキーは持たせない）。 */
export interface CrashContext {
  screen: CrashScreen;
  op: CrashOp;
}
