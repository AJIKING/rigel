// ============================================================
// application — AnalyzeAndSaveKifu ユースケース
// ------------------------------------------------------------
// 撮影画像 → 牌譜ドラフト生成 → 半荘に局として保存 → 課金カウント加算 を束ねる。
// ドメインのポート（リポジトリ/Analyzer）だけに依存し、Drizzle/Gemini/HTTP を知らない。
//
// 信頼ゲートの要:
//   - 解析が成功して保存できたときだけカウントを進める（成功時のみ加算）。
//   - 無料枠を超えるユーザーには解析させない。
// ============================================================

import type { Game } from "../domain/game/game";
import type { GameRepository } from "../domain/game/game.repository";
import type { AnalysisInput, Analyzer } from "../domain/kifu/analyzer";
import type { GameLog } from "../domain/kifu/game-log";
import type { GameLogRepository } from "../domain/kifu/game-log.repository";
import type { UserRepository } from "../domain/user/user.repository";

export type AnalyzeResult =
  | { ok: true; gameLog: GameLog; gameId: string }
  | { ok: false; reason: "user_not_found" | "quota_exceeded" | "game_not_found" };

export interface AnalyzeDeps {
  users: UserRepository;
  games: GameRepository;
  gameLogs: GameLogRepository;
  analyzer: Analyzer;
  /** 現在時刻（テスト容易性のため注入）。 */
  now: () => Date;
  /** ID生成（テスト容易性のため注入）。 */
  newId: () => string;
}

export interface AnalyzeParams {
  userId: string;
  input: AnalysisInput;
  /** 追加先の半荘。未指定なら新しい半荘を作る。 */
  gameId?: string;
}

export class AnalyzeAndSaveKifu {
  constructor(private readonly deps: AnalyzeDeps) {}

  async execute(params: AnalyzeParams): Promise<AnalyzeResult> {
    const { users, games, gameLogs, analyzer, now, newId } = this.deps;

    const user = await users.findById(params.userId);
    if (!user) return { ok: false, reason: "user_not_found" };
    if (!user.canAnalyze(now())) return { ok: false, reason: "quota_exceeded" };

    // 既存半荘の指定があれば、解析の前に所有確認（無駄な解析・課金を避ける）。
    let game: Game | null = null;
    if (params.gameId) {
      game = await games.findById(params.gameId);
      if (!game || game.userId !== user.id) return { ok: false, reason: "game_not_found" };
    }

    // 画像 → 牌譜ドラフト（Analyzer 内で Zod 検証済みのものが返る契約）。
    // ここで例外が出たら以降は実行されず、半荘作成も保存もカウント加算もされない。
    const kifu = await analyzer.analyze(params.input);

    // 解析が成功してから、新規なら半荘を作る（失敗時に空の半荘を残さない）。
    if (!game) {
      game = { id: newId(), userId: user.id, title: "", createdAt: now() };
      await games.save(game);
    }

    const existing = await gameLogs.listByGame(game.id);
    const gameLog: GameLog = {
      id: newId(),
      userId: user.id,
      gameId: game.id,
      seq: existing.length + 1,
      kifu,
      createdAt: now(),
    };

    // 保存が成功してからカウントを進める（成功時のみ加算）。
    // ⚠️【未確定/要設計】半荘作成・局保存・カウント加算の原子性は、infrastructure 層で
    //    D1 の batch/トランザクションにまとめて担保する（競合での二重加算・取りこぼし防止）。
    await gameLogs.save(gameLog);
    user.recordSuccessfulAnalysis(now());
    await users.save(user);

    return { ok: true, gameLog, gameId: game.id };
  }
}
