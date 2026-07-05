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
import type { UserRepository } from "../domain/user/user.repository";
import { MAX_LOGS_PER_GAME } from "./create-empty-kifu.usecase";

export type AnalyzeResult =
  | { ok: true; gameLog: GameLog; gameId: string }
  | {
      ok: false;
      reason: "user_not_found" | "quota_exceeded" | "game_not_found" | "game_full";
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
    // Free は AI再現なし（枠0）＝ここで弾かれる。解析できるのは有料プランのみ。
    if (!user.canAnalyze(now())) return { ok: false, reason: "quota_exceeded" };

    // 既存半荘の指定があれば、解析の前に所有確認（無駄な解析・課金を避ける）。
    let game: Game | null = null;
    if (params.gameId) {
      game = await games.findById(params.gameId);
      if (!game || game.userId !== user.id) return { ok: false, reason: "game_not_found" };
      // 1半荘30局まで（解析前に弾いて無駄な課金を避ける）。
      if ((await gameLogs.listByGame(game.id)).length >= MAX_LOGS_PER_GAME) {
        return { ok: false, reason: "game_full" };
      }
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
      // 公開範囲は半荘単位（既存局があれば引き継ぐ）。新規半荘は非公開・下書きで開始。
      visibility: existing[0]?.visibility ?? "private",
      status: "draft",
      createdAt: now(),
    };

    user.recordGeminiCalls(now(), geminiCalls);

    // 半荘(新規)・局・カウント加算を1トランザクションで保存（成功時のみ加算）。
    await store.commit({ newGame: isNewGame ? game : null, gameLog, user });

    return { ok: true, gameLog, gameId: game.id };
  }
}
