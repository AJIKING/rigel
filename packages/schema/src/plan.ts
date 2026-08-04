// ============================================================
// プラン上限ポリシー（背骨の一部・単一真実源）
// ------------------------------------------------------------
// api(サーバ強制) と web/mobile(表示文言) が共有する課金・保存上限の定数。
// かつて apps/api/src/domain/user と @rigel/ui で二重定義し「一致させる」
// コメントで手動同期していたものを、ここに一元化して drift を構造的に防ぐ。
//
// 値の変更は料金プランの変更（CLAUDE.md ハードルール6・7）。
// 設計ドキュメント（docs/mahjong-kifu-app-design.md 7章）の更新を伴うこと。
// ============================================================

import { z } from "zod";

// ------------------------------------------------------------
// プラン識別子
// ------------------------------------------------------------

export const PLAN_VALUES = ["free", "next", "pro"] as const;
export const PlanSchema = z.enum(PLAN_VALUES);
export type Plan = z.infer<typeof PlanSchema>;

/** 有料プラン（Stripe Checkout / RevenueCat の購入対象）。 */
export const PaidPlanSchema = z.enum(["next", "pro"]);
export type PaidPlan = z.infer<typeof PaidPlanSchema>;

// ------------------------------------------------------------
// AI 解析枠（課金の中心値）
// ------------------------------------------------------------

/**
 * プランごとの月あたり Gemini 呼び出し上限。
 * 1局の解析は河(4方向)＋撮影した手牌の枚数ぶん呼び出すので、枠は「局数」ではなく
 * 実呼び出し回数で数える。Free は AI再現なし（枠0）。AI再現は Next 以上。
 */
export const MONTHLY_CALL_QUOTA: Record<Plan, number> = { free: 0, next: 100, pro: 320 };

// ------------------------------------------------------------
// 保存上限（半荘単位。null=無制限）
// ------------------------------------------------------------

/** プランごとの private(非公開)かつ complete(編集済) の保存上限（半荘数で数える）。
 *  null は無制限。下書き(draft)はこの上限に数えない（別枠 = DRAFT_KIFU_LIMIT）。 */
export const PRIVATE_KIFU_LIMIT: Record<Plan, number | null> = {
  free: 5,
  next: null,
  pro: null,
};

/** プランごとの下書き(draft)保存上限（半荘数で数える）。null は無制限（有料）。非公開上限とは別枠。 */
export const DRAFT_KIFU_LIMIT: Record<Plan, number | null> = { free: 5, next: null, pro: null };

/** プランごとの何切る問題の保存上限（draft+published 合算）。null は無制限（有料）。 */
export const PROBLEM_LIMIT: Record<Plan, number | null> = { free: 20, next: null, pro: null };

// ------------------------------------------------------------
// 半荘の構造上限（全プラン共通）
// ------------------------------------------------------------

/** 1半荘あたりに追加できる局(牌譜)の上限。 */
export const MAX_LOGS_PER_GAME = 30;

/** 局順(seq)の上限。roundNameForSeq が表せる範囲（東一局=1〜北四局=16）に合わせる。 */
export const MAX_SEQ = 16;

// ------------------------------------------------------------
// 特訓クイズ
// ------------------------------------------------------------

/** 無料プランの特訓クイズ回数上限（1日・種目共通・JST 0時回復・開始時に1回消費）。有料は無制限。
 *  api がサーバ強制に、web/mobile が文言表示に使う（Plan: docs/plans/quiz-training.md）。
 *  [決定] 2026-08-04 オーナー: 3→10 に拡大（Plan: docs/plans/quiz-open-and-ranking.md Phase 2）。 */
export const FREE_QUIZ_PER_DAY = 10;
