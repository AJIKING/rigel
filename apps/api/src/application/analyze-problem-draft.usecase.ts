// ============================================================
// application — AnalyzeProblemDraft ユースケース（何切るの写真AI再現）
// ------------------------------------------------------------
// 撮影画像（手牌必須・河任意）→ 牌譜ドラフト生成 → ドラフトを返すだけ。
// **保存はしない**（何切るは作者が編集してから保存する。行は増やさない）。
// Plan: docs/plans/problem-photo-analyze.md
//
// 信頼ゲート:
//   - 解析が成功したときだけカウントを進める（recordCalls＝差分の原子適用）。
//   - 枠の無いユーザー（free含む）には解析させない。
//   - このユースケース自身は画像を保存しない（保存は Start 側の責務。photo-retention.md）。
// ============================================================

import type { Kifu } from "@rigel/schema";
import type { AnalysisStore } from "../domain/analysis/analysis-store";
import type { AnalysisInput, Analyzer } from "../domain/kifu/analyzer";
import { firstOfNextMonthUtc } from "../domain/user/user";
import type { UserRepository } from "../domain/user/user.repository";

export type AnalyzeProblemDraftResult =
  { ok: true; kifu: Kifu } | { ok: false; reason: "user_not_found" | "quota_exceeded" };

export interface AnalyzeProblemDraftDeps {
  users: UserRepository;
  analyzer: Analyzer;
  /** カウンタの原子加算に使う（行の保存はしない）。 */
  store: AnalysisStore;
  now: () => Date;
}

export class AnalyzeProblemDraft {
  constructor(private readonly deps: AnalyzeProblemDraftDeps) {}

  /** 解析枠のプリフライト（画像バイトを読む前に呼ぶ。AnalyzeAndSaveKifu と同じ入口規律）。 */
  async preflight(
    userId: string,
  ): Promise<{ ok: true } | { ok: false; reason: "user_not_found" | "quota_exceeded" }> {
    const user = await this.deps.users.findById(userId);
    if (!user) return { ok: false, reason: "user_not_found" };
    if (!user.canAnalyze(this.deps.now())) return { ok: false, reason: "quota_exceeded" };
    return { ok: true };
  }

  async execute(params: {
    userId: string;
    input: AnalysisInput;
  }): Promise<AnalyzeProblemDraftResult> {
    const { users, analyzer, store, now } = this.deps;

    const user = await users.findById(params.userId);
    if (!user) return { ok: false, reason: "user_not_found" };
    // 枠の無いユーザー（free=枠0）はここで弾く＝Gemini を呼ばない。
    if (!user.canAnalyze(now())) return { ok: false, reason: "quota_exceeded" };

    // 失敗（例外）ならここで抜ける＝カウントは進まない（成功時のみ加算）。
    const { kifu, geminiCalls } = await analyzer.analyze(params.input);

    const at = now();
    await store.recordCalls({
      userId: user.id,
      calls: geminiCalls,
      now: at,
      nextResetAt: firstOfNextMonthUtc(at),
    });

    return { ok: true, kifu };
  }
}
