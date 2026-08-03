// application — 半荘（Game）を配下の全局ごと削除するユースケース。
// 所有者のみ。他人の半荘・不存在はどちらも not_found（存在を漏らさない）。

import type { AnalysisJobRepository } from "../domain/analysis/analysis-job";
import { gamePhotosPrefix } from "../domain/analysis/analysis-transport";
import type { FavoriteRepository } from "../domain/favorite/favorite.repository";
import type { GameRepository } from "../domain/game/game.repository";
import type { GameLogRepository } from "../domain/kifu/game-log.repository";
import { findOwnedGame } from "./owned-game";

export type DeleteGameResult = { ok: true } | { ok: false; reason: "not_found" };

export class DeleteGame {
  constructor(
    private readonly games: GameRepository,
    private readonly gameLogs: GameLogRepository,
    private readonly favorites: FavoriteRepository,
    private readonly jobs: AnalysisJobRepository,
    /** 元写真の掃除（photo-retention.md。削除はデータ削除時）。 */
    private readonly images: { deletePrefix(prefix: string): Promise<void> },
  ) {}

  async execute(params: { userId: string; gameId: string }): Promise<DeleteGameResult> {
    const game = await findOwnedGame(this.games, params.gameId, params.userId);
    if (!game) return { ok: false, reason: "not_found" };
    await this.gameLogs.deleteByGame(params.gameId);
    // ★は対象への外部キーを持てない（ポリモーフィック）ので明示的に消す。
    await this.favorites.deleteByTarget("game", params.gameId);
    // 解析ジョブも FK を張っていないので明示的に掃除する（processing はキャンセル扱い:
    // consumer はジョブ行が無ければ何もしないため、進行中でも安全）。
    await this.jobs.deleteByGame(params.gameId);
    // 元写真（R2）は D1 の半荘行より先に消す（行を先に消すと参照が失われ回収不能になる）。
    await this.images.deletePrefix(gamePhotosPrefix(params.gameId));
    await this.games.deleteById(params.gameId);
    return { ok: true };
  }
}
