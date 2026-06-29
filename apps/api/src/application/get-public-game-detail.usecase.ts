// application — 公開半荘の取得（読み取り専用ビューア用）。
// 半荘の「公開局のみ」＋所有者の表示情報を返す。閲覧は誰でも可（認証不要）。
// 公開局が1つも無ければ null（=非公開/不在）。

import type { GameRepository } from "../domain/game/game.repository";
import type { GameLog } from "../domain/kifu/game-log";
import type { GameLogRepository } from "../domain/kifu/game-log.repository";
import type { UserRepository } from "../domain/user/user.repository";

export interface PublicGameDetail {
  game: { id: string; title: string; createdAt: Date };
  owner: { id: string; handle: string | null; displayName: string };
  /** 公開局のみ（seq 昇順）。 */
  logs: GameLog[];
}

export class GetPublicGameDetail {
  constructor(
    private readonly games: GameRepository,
    private readonly gameLogs: GameLogRepository,
    private readonly users: UserRepository,
  ) {}

  async execute(gameId: string): Promise<PublicGameDetail | null> {
    const game = await this.games.findById(gameId);
    if (!game) return null;
    const logs = (await this.gameLogs.listByGame(gameId)).filter((l) => l.visibility === "public");
    if (logs.length === 0) return null;
    const owner = await this.users.findById(game.userId);
    return {
      game: { id: game.id, title: game.title, createdAt: game.createdAt },
      owner: owner
        ? { id: owner.id, handle: owner.handle, displayName: owner.displayName }
        : { id: game.userId, handle: null, displayName: "" },
      logs,
    };
  }
}
