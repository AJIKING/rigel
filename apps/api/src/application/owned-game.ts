// application — 半荘の所有者確認の共通ヘルパ。
// 「自分の半荘なら返す、他人・不存在なら null」を1か所に集約し、各ユースケースの
// 所有者チェックを揃える（他人の半荘の存在を漏らさない = どちらも not_found 扱い）。

import type { Game } from "../domain/game/game";
import type { GameRepository } from "../domain/game/game.repository";

/** userId が所有する半荘を返す。存在しない/他人のものは null。 */
export async function findOwnedGame(
  games: GameRepository,
  gameId: string,
  userId: string,
): Promise<Game | null> {
  const game = await games.findById(gameId);
  return game && game.userId === userId ? game : null;
}
