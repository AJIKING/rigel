// application — 半荘（Game）のタイトルを変更するユースケース。所有者のみ。
// 他人の半荘・不存在はどちらも not_found（存在を漏らさない）。空白は除去し 80字以内。

import type { GameRepository } from "../domain/game/game.repository";

const TITLE_MAX = 80;

export type UpdateGameResult = { ok: true } | { ok: false; reason: "not_found" | "invalid" };

export class UpdateGame {
  constructor(private readonly games: GameRepository) {}

  async execute(params: {
    userId: string;
    gameId: string;
    title: string;
  }): Promise<UpdateGameResult> {
    const title = params.title.trim();
    if (title.length > TITLE_MAX) return { ok: false, reason: "invalid" };
    const game = await this.games.findById(params.gameId);
    if (!game || game.userId !== params.userId) return { ok: false, reason: "not_found" };
    await this.games.save({ ...game, title });
    return { ok: true };
  }
}
