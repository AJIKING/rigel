// ============================================================
// application — AnalyzeAndSaveKifu ユースケース
// ------------------------------------------------------------
// 撮影画像 → 牌譜ドラフト生成 → 保存 → 課金カウント加算 を束ねる。
// ドメインのポート（リポジトリ/Analyzer）だけに依存し、Drizzle/Gemini/HTTP を知らない。
//
// 信頼ゲートの要:
//   - 解析が成功して保存できたときだけカウントを進める（成功時のみ加算）。
//   - 無料枠を超えるユーザーには解析させない。
// ============================================================

import type { AnalysisInput, Analyzer } from "../domain/kifu/analyzer";
import type { GameLog } from "../domain/kifu/game-log";
import type { GameLogRepository } from "../domain/kifu/game-log.repository";
import type { UserRepository } from "../domain/user/user.repository";

export type AnalyzeResult =
  { ok: true; gameLog: GameLog } | { ok: false; reason: "user_not_found" | "quota_exceeded" };

export interface AnalyzeDeps {
  users: UserRepository;
  gameLogs: GameLogRepository;
  analyzer: Analyzer;
  /** 現在時刻（テスト容易性のため注入）。 */
  now: () => Date;
  /** 牌譜ID生成（テスト容易性のため注入）。 */
  newId: () => string;
}

export class AnalyzeAndSaveKifu {
  constructor(private readonly deps: AnalyzeDeps) {}

  async execute(params: { userId: string; input: AnalysisInput }): Promise<AnalyzeResult> {
    const { users, gameLogs, analyzer, now, newId } = this.deps;

    const user = await users.findById(params.userId);
    if (!user) return { ok: false, reason: "user_not_found" };

    if (!user.canAnalyze(now())) return { ok: false, reason: "quota_exceeded" };

    // 画像 → 牌譜ドラフト（Analyzer 内で Zod 検証済みのものが返る契約）。
    // ここで例外が出たら以降は実行されず、保存もカウント加算もされない。
    const kifu = await analyzer.analyze(params.input);

    const gameLog: GameLog = {
      id: newId(),
      userId: user.id,
      kifu,
      createdAt: now(),
    };

    // 保存が成功してからカウントを進める（成功時のみ加算）。
    // ⚠️【未確定/要設計】保存とカウント加算の原子性は、infrastructure 層で
    //    D1 の batch/トランザクションにまとめて担保する（競合での二重加算・取りこぼし防止）。
    await gameLogs.save(gameLog);
    user.recordSuccessfulAnalysis(now());
    await users.save(user);

    return { ok: true, gameLog };
  }
}
