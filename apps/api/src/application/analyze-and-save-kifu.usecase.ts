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
import { firstOfNextMonthUtc } from "../domain/user/user";
import type { UserRepository } from "../domain/user/user.repository";
import { MAX_LOGS_PER_GAME } from "./create-empty-kifu.usecase";
import { autoSeq } from "./update-kifu.usecase";

export type AnalyzeResult =
  { ok: true; gameLog: GameLog; gameId: string } | { ok: false; reason: AnalyzeReason };

/** 解析を実行できなかった理由。 */
export type AnalyzeReason = "user_not_found" | "quota_exceeded" | "game_not_found" | "game_full";

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

  /**
   * 解析枠・半荘のプリフライト（画像バイトを読む前に呼ぶ）。
   * 枠0（free）や上限到達のユーザーに、画像を Worker のメモリへ載せさせないための入口。
   * gameId 指定時は所有・局数上限も同期で弾く（非同期ジョブ化で 202 を返す前の検証。
   * docs/plans/async-analysis.md）。execute 側でも同じ判定をするため、ここを通っても
   * 最終的な整合は崩れない。
   */
  async preflight(
    userId: string,
    gameId?: string,
  ): Promise<{ ok: true } | { ok: false; reason: AnalyzeReason }> {
    const user = await this.deps.users.findById(userId);
    if (!user) return { ok: false, reason: "user_not_found" };
    if (!user.canAnalyze(this.deps.now())) return { ok: false, reason: "quota_exceeded" };
    if (gameId) {
      const game = await this.deps.games.findById(gameId);
      if (!game || game.userId !== userId) return { ok: false, reason: "game_not_found" };
      if ((await this.deps.gameLogs.listByGame(gameId)).length >= MAX_LOGS_PER_GAME) {
        return { ok: false, reason: "game_full" };
      }
    }
    return { ok: true };
  }

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
      // 局順の自動採番（16で頭打ち。連荘で局数が16を超えても保存可能な範囲に収める）。
      seq: autoSeq(existing.length),
      kifu,
      // 公開範囲・編集状態は半荘単位（既存局があれば引き継ぐ）。新規半荘は非公開・下書きで開始。
      visibility: existing[0]?.visibility ?? "private",
      status: existing[0]?.status ?? "draft",
      createdAt: now(),
    };

    // 半荘(新規)・局・カウント加算を1トランザクションで保存（成功時のみ加算）。
    // カウンタは「最終状態の書き戻し」ではなく差分で渡す（並行解析での取りこぼし防止）。
    // 月境界のリセット時刻はドメインの規則（firstOfNextMonthUtc）で決める。
    const at = now();
    await store.commit({
      newGame: isNewGame ? game : null,
      gameLog,
      counter: {
        userId: user.id,
        calls: geminiCalls,
        now: at,
        nextResetAt: firstOfNextMonthUtc(at),
      },
    });

    return { ok: true, gameLog, gameId: game.id };
  }
}
