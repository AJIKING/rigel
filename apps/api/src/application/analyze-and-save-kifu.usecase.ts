// ============================================================
// application — AnalyzeAndSaveKifu ユースケース
// ------------------------------------------------------------
// 撮影画像 → 牌譜ドラフト生成 → 半荘に局として保存 → 課金カウント加算 を束ねる。
// ドメインのポート（リポジトリ/Analyzer/AnalysisStore）だけに依存し、Drizzle/Gemini/HTTP を知らない。
//
// 信頼ゲートの要:
//   - 解析が成功して保存できたときだけカウントを進める（成功時のみ加算）。
//   - 無料枠を超えるユーザーには解析させない。
//   - 半荘作成・局保存・カウント加算は AnalysisStore で **1トランザクション** に束ねる（原子性）。
// ============================================================

import type { AnalysisStore } from "../domain/analysis/analysis-store";
import type { Game } from "../domain/game/game";
import type { GameRepository } from "../domain/game/game.repository";
import type { AnalysisInput, Analyzer } from "../domain/kifu/analyzer";
import type { GameLog } from "../domain/kifu/game-log";
import type { GameLogRepository } from "../domain/kifu/game-log.repository";
import { privateKifuLimit } from "../domain/user/user";
import type { UserRepository } from "../domain/user/user.repository";

export type AnalyzeResult =
  | { ok: true; gameLog: GameLog; gameId: string }
  | {
      ok: false;
      reason: "user_not_found" | "quota_exceeded" | "game_not_found" | "private_limit";
    };

export interface AnalyzeDeps {
  users: UserRepository;
  games: GameRepository;
  gameLogs: GameLogRepository;
  analyzer: Analyzer;
  /** 半荘・局・カウントを原子的に保存する。 */
  store: AnalysisStore;
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
    const { users, games, gameLogs, analyzer, store, now, newId } = this.deps;

    const user = await users.findById(params.userId);
    if (!user) return { ok: false, reason: "user_not_found" };
    if (!user.canAnalyze(now())) return { ok: false, reason: "quota_exceeded" };

    // 新規牌譜は private で作るので、無料プランの非公開上限に達していれば
    // 解析(=Gemini 枠の消費)に入る前に断る。
    const limit = privateKifuLimit(user.plan);
    if (limit !== null) {
      const current = await gameLogs.countByUserAndVisibility(user.id, "private");
      if (current >= limit) return { ok: false, reason: "private_limit" };
    }

    // 既存半荘の指定があれば、解析の前に所有確認（無駄な解析・課金を避ける）。
    let game: Game | null = null;
    if (params.gameId) {
      game = await games.findById(params.gameId);
      if (!game || game.userId !== user.id) return { ok: false, reason: "game_not_found" };
    }

    // 画像 → 牌譜ドラフト（Analyzer 内で Zod 検証済みのものが返る契約）。
    // ここで例外が出たら以降は実行されず、半荘作成も保存もカウント加算もされない。
    const { kifu, geminiCalls } = await analyzer.analyze(params.input);

    // 解析が成功してから、新規なら半荘を組み立てる（保存はトランザクション内）。
    const isNewGame = game === null;
    if (!game) game = { id: newId(), userId: user.id, title: "", createdAt: now() };

    const existing = isNewGame ? [] : await gameLogs.listByGame(game.id);
    const gameLog: GameLog = {
      id: newId(),
      userId: user.id,
      gameId: game.id,
      seq: existing.length + 1,
      kifu,
      // 新規牌譜は既定で非公開。公開は所有者が明示的に切り替える。
      visibility: "private",
      createdAt: now(),
    };

    user.recordGeminiCalls(now(), geminiCalls);

    // 半荘(新規)・局・カウント加算を1トランザクションで保存（成功時のみ加算）。
    await store.commit({ newGame: isNewGame ? game : null, gameLog, user });

    return { ok: true, gameLog, gameId: game.id };
  }
}
