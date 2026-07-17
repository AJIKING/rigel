// ============================================================
// @rigel/ui — 計測イベントの共有定義（web=GA4 / mobile=Firebase Analytics）
// ------------------------------------------------------------
// Firebase Analytics の実体は GA4。1つの GA4 プロパティ（web/iOS/Android の
// 3ストリーム）で横断分析するため、イベント名はここを唯一の真実源にする。
//
// 規律（信頼ゲート）:
//  - PII（メール・選手名・handle・牌譜内容・写真・トークン類）は絶対に載せない。
//  - パラメータはここで列挙した固定語彙だけ（自由文字列を渡さない）。
//  - 広告用途に使わない（広告ID収集は無効化。SIWA 審査要件 4.8 と整合）。
// 設計: docs/plans/analytics.md
// ============================================================

export const ANALYTICS_EVENTS = {
  /** ログイン成立（GA4 標準イベント）。params: { method: LoginMethod } */
  login: "login",
  /** 初回登録（GA4 標準イベント）。params: { method: LoginMethod } */
  signUp: "sign_up",
  /** 撮影→牌譜解析（コアファネル）。params: { result: AnalyzeResultParam } */
  analyzeKifu: "analyze_kifu",
  /** 何切るの写真AI再現。params: { result: AnalyzeResultParam } */
  analyzeProblem: "analyze_problem",
  /** 局の保存（エディタ）。 */
  saveKifu: "save_kifu",
  /** 何切る回答。 */
  answerProblem: "answer_problem",
} as const;

export type AnalyticsEvent = (typeof ANALYTICS_EVENTS)[keyof typeof ANALYTICS_EVENTS];

/** login/sign_up の method パラメータ（認証プロバイダ）。 */
export type LoginMethod = "google" | "apple";

/** 解析イベントの result パラメータ。 */
export type AnalyzeResultParam = "success" | "error";

/** イベントに添えてよいパラメータ（固定語彙のみ。自由文字列・PII は型で締め出す）。 */
export type AnalyticsParams = Partial<{
  method: LoginMethod;
  result: AnalyzeResultParam;
}>;
