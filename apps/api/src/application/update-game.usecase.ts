// application — 半荘（Game）のタイトル・対局日を変更するユースケース。所有者のみ。
// 他人の半荘・不存在はどちらも not_found（存在を漏らさない）。空白は除去し 80字以内。
// 対局日は createdAt を上書きする（[決定] 2026-07-29: 写真からの作成日=対局日とは
// 限らないため所有者が補正できる。一覧の「新しい順」等の並びにもこの値が使われる）。

import type { GameRepository } from "../domain/game/game.repository";
import { findOwnedGame } from "./owned-game";

const TITLE_MAX = 80;
/** 対局日として受け付ける範囲（タイプミス・ゴミ値の混入をここで止める）。 */
const DATE_MIN = Date.parse("2000-01-01T00:00:00.000Z");
const DATE_MAX_AHEAD_MS = 86_400_000; // 未来は1日まで（時差ずれの許容）

export type UpdateGameResult = { ok: true } | { ok: false; reason: "not_found" | "invalid" };

export class UpdateGame {
  constructor(
    private readonly games: GameRepository,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async execute(params: {
    userId: string;
    gameId: string;
    title?: string;
    /** 対局日（YYYY-MM-DD または ISO 日時）。 */
    createdAt?: string;
  }): Promise<UpdateGameResult> {
    const title = params.title?.trim();
    if (title !== undefined && title.length > TITLE_MAX) return { ok: false, reason: "invalid" };

    let createdAt: Date | undefined;
    if (params.createdAt !== undefined) {
      const t = Date.parse(params.createdAt);
      if (Number.isNaN(t) || t < DATE_MIN || t > this.now().getTime() + DATE_MAX_AHEAD_MS) {
        return { ok: false, reason: "invalid" };
      }
      createdAt = new Date(t);
    }

    if (title === undefined && createdAt === undefined) return { ok: false, reason: "invalid" };

    const game = await findOwnedGame(this.games, params.gameId, params.userId);
    if (!game) return { ok: false, reason: "not_found" };
    await this.games.save({
      ...game,
      ...(title !== undefined ? { title } : null),
      ...(createdAt !== undefined ? { createdAt } : null),
    });
    return { ok: true };
  }
}
