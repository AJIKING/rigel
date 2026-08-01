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

import type { QuizKind } from "@rigel/schema";

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
  /** 特訓クイズの開始。params: { kind: QuizKind }（成績は載せない）。 */
  quizStart: "quiz_start",
  /** 特訓クイズの完了（60秒経過で結果表示）。params: { kind: QuizKind }（成績は載せない）。 */
  quizComplete: "quiz_complete",
} as const;

export type AnalyticsEvent = (typeof ANALYTICS_EVENTS)[keyof typeof ANALYTICS_EVENTS];

/** login/sign_up の method パラメータ（認証プロバイダ。review=ストア審査用の合言葉ログイン）。 */
export type LoginMethod = "google" | "apple" | "review";

/** 解析イベントの result パラメータ。 */
export type AnalyzeResultParam = "success" | "error";

/** イベントに添えてよいパラメータ（固定語彙のみ。自由文字列・PII は型で締め出す）。 */
export type AnalyticsParams = Partial<{
  method: LoginMethod;
  result: AnalyzeResultParam;
  /** quiz_start / quiz_complete の種目（固定語彙。成績の数値は型で締め出す）。 */
  kind: QuizKind;
}>;
