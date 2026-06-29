// application — 一覧画面用の半荘カード。
//   ListMyGamesWithCounts: 自分の半荘＋局数/公開数（マイページ）。
//   ListPublicGames: 公開局を含む半荘を全ユーザーから新着順に（公開牌譜）。
// 牌譜(局)の公開範囲は game_log 単位なので、半荘は「公開局を含むか」で公開扱いにする。

import type { GameRepository } from "../domain/game/game.repository";
import type { GameLogRepository } from "../domain/kifu/game-log.repository";

export interface MyGameCard {
  id: string;
  title: string;
  createdAt: Date;
  /** 半荘内の局数。 */
  kyokuCount: number;
  /** 公開している局数（0 より大きければ半荘は「公開」）。 */
  publicCount: number;
}

export interface PublicGameCard {
  id: string;
  ownerId: string;
  title: string;
  createdAt: Date;
  /** 公開している局数。 */
  kyokuCount: number;
  /** 最新の公開局ID（カードを開いたときの読み取り表示先）。 */
  firstLogId: string;
}

export class ListMyGamesWithCounts {
  constructor(
    private readonly games: GameRepository,
    private readonly gameLogs: GameLogRepository,
  ) {}

  async execute(userId: string): Promise<MyGameCard[]> {
    const games = await this.games.listByUser(userId);
    const cards = await Promise.all(
      games.map(async (g) => {
        const logs = await this.gameLogs.listByGame(g.id);
        return {
          id: g.id,
          title: g.title,
          createdAt: g.createdAt,
          kyokuCount: logs.length,
          publicCount: logs.filter((l) => l.visibility === "public").length,
        };
      }),
    );
    return cards.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }
}

export class ListPublicGames {
  constructor(
    private readonly games: GameRepository,
    private readonly gameLogs: GameLogRepository,
  ) {}

  async execute(limit = 60): Promise<PublicGameCard[]> {
    const pub = await this.gameLogs.listPublic(200);
    // gameId ごとに公開局数を数える（出現順＝新着順を保つ）。最初の出現＝最新の公開局。
    const order: string[] = [];
    const counts = new Map<string, number>();
    const firstLog = new Map<string, string>();
    for (const log of pub) {
      const gid = log.gameId;
      if (!gid) continue;
      if (!counts.has(gid)) {
        order.push(gid);
        firstLog.set(gid, log.id);
      }
      counts.set(gid, (counts.get(gid) ?? 0) + 1);
    }
    const cards: PublicGameCard[] = [];
    for (const gid of order.slice(0, limit)) {
      const game = await this.games.findById(gid);
      if (!game) continue;
      cards.push({
        id: game.id,
        ownerId: game.userId,
        title: game.title,
        createdAt: game.createdAt,
        kyokuCount: counts.get(gid) ?? 0,
        firstLogId: firstLog.get(gid)!,
      });
    }
    return cards;
  }
}
