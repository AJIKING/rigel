// application — ListGames（ユーザーの半荘一覧）。

import type { Game } from "../domain/game/game";
import type { GameRepository } from "../domain/game/game.repository";

export class ListGames {
  constructor(private readonly games: GameRepository) {}

  execute(userId: string): Promise<Game[]> {
    return this.games.listByUser(userId);
  }
}
