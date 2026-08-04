// application — 一覧画面用の半荘カード。
//   ListMyGamesWithCounts: 自分の半荘＋局数/公開数（マイページ）。
//   ListPublicGames: 公開局を含む半荘を全ユーザーから新着順に（公開牌譜）。
// 牌譜(局)の公開範囲は game_log 単位なので、半荘は「公開局を含むか」で公開扱いにする。

import type { AnalysisJobRepository } from "../domain/analysis/analysis-job";
import type { GameRepository } from "../domain/game/game.repository";
import type { GameLogRepository } from "../domain/kifu/game-log.repository";
import type { UserRepository } from "../domain/user/user.repository";
import { deriveAnalysisStatus, type GameAnalysisStatus } from "./analysis-status";
import { fetchPage, type PagedResult } from "./pagination";

export interface MyGameCard {
  id: string;
  title: string;
  createdAt: Date;
  /** 半荘内の局数。 */
  kyokuCount: number;
  /** 公開している局数（0 より大きければ半荘は「公開」）。 */
  publicCount: number;
  /** 下書き(draft)の局数（0 なら全局が編集済）。一覧の下書き/編集済表示に使う。 */
  draftCount: number;
  /** 解析ジョブの状態（半荘先行作成。plan 8-3）。null=通常表示。 */
  analysisStatus: GameAnalysisStatus | null;
  /** 最新の解析ジョブID（failed のとき「もう一度解析」の宛先。Phase 2）。 */
  analysisJobId: string | null;
}

export interface PublicGameCard {
  id: string;
  ownerId: string;
  /** 著者ハンドル(@なし)。プロフィール非公開・未設定なら null。 */
  ownerHandle: string | null;
  /** 著者の表示名。プロフィール非公開なら null。 */
  ownerName: string | null;
  title: string;
  createdAt: Date;
  /** 公開している局数。 */
  kyokuCount: number;
  /** 最新の公開局ID（カードを開いたときの読み取り表示先）。 */
  firstLogId: string;
}

/** マイページ半荘一覧のページサイズ（Plan: docs/plans/list-pagination.md 3-3）。 */
const MY_GAMES_PAGE_SIZE = 30;

export type ListMyGamesResult = PagedResult<MyGameCard>;

export class ListMyGamesWithCounts {
  constructor(
    private readonly games: GameRepository,
    private readonly gameLogs: GameLogRepository,
    private readonly jobs: AnalysisJobRepository,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async execute(userId: string, cursorRaw?: string): Promise<ListMyGamesResult> {
    const page = await fetchPage(
      cursorRaw,
      MY_GAMES_PAGE_SIZE,
      (limit, cursor) => this.games.listByUserPage(userId, limit, cursor),
      (g) => ({ ms: g.createdAt.getTime(), id: g.id }),
    );
    if (!page.ok) return page;
    // 解析中/解析失敗の表示はサーバーが真実源（端末をまたいでも見える。plan 8-3）。
    const analysis = deriveAnalysisStatus(await this.jobs.listActiveByUser(userId), this.now());
    const cards = await Promise.all(
      page.items.map(async (g) => {
        const logs = await this.gameLogs.listByGame(g.id);
        return {
          id: g.id,
          title: g.title,
          createdAt: g.createdAt,
          kyokuCount: logs.length,
          // 公開として見えるのは編集済(complete)のみ。
          publicCount: logs.filter((l) => l.visibility === "public" && l.status === "complete")
            .length,
          draftCount: logs.filter((l) => l.status === "draft").length,
          analysisStatus: analysis.get(g.id)?.status ?? null,
          analysisJobId: analysis.get(g.id)?.jobId ?? null,
        };
      }),
    );
    return { ok: true, items: cards, nextCursor: page.nextCursor };
  }
}

/** 公開フィードのページサイズ（Plan: docs/plans/list-pagination.md 3-3）。 */
const PUBLIC_GAMES_PAGE_SIZE = 30;

export type ListPublicGamesResult = PagedResult<PublicGameCard>;

export class ListPublicGames {
  constructor(
    private readonly games: GameRepository,
    private readonly gameLogs: GameLogRepository,
    private readonly users: UserRepository,
  ) {}

  /** 公開フィードの1ページ（最新公開局の時刻順・カーソル方式）。
   *  旧実装の「直近200公開局の窓から組み立てる」方式は、窓に埋もれた古い半荘へ永久に
   *  到達できなかったため、公開半荘を SQL 側で直接ページングする形に置き換えた。 */
  async execute(cursorRaw?: string): Promise<ListPublicGamesResult> {
    // 一覧は牌譜本体を読まない（集約のみ）。コストが保存内容のサイズに比例しないようにする。
    const page = await fetchPage(
      cursorRaw,
      PUBLIC_GAMES_PAGE_SIZE,
      (limit, cursor) => this.gameLogs.listPublicGameGroups(limit, cursor),
      (g) => ({ ms: g.latestAt.getTime(), id: g.gameId }),
    );
    if (!page.ok) return page;

    // 著者は同一ユーザーが複数半荘を持つので userId でキャッシュして重複取得を避ける。
    const ownerCache = new Map<string, { handle: string | null; name: string | null }>();
    const resolveOwner = async (userId: string) => {
      const cached = ownerCache.get(userId);
      if (cached) return cached;
      const user = await this.users.findById(userId);
      // プロフィールは常に公開。著者名（handle/表示名）を出す。
      const author = user
        ? { handle: user.handle ?? null, name: user.displayName || null }
        : { handle: null, name: null };
      ownerCache.set(userId, author);
      return author;
    };

    const cards: PublicGameCard[] = [];
    for (const g of page.items) {
      const game = await this.games.findById(g.gameId);
      if (!game) continue; // 読んでいる間に削除された半荘はスキップ（ページが僅かに欠けるのは許容）
      const owner = await resolveOwner(game.userId);
      cards.push({
        id: game.id,
        ownerId: game.userId,
        ownerHandle: owner.handle,
        ownerName: owner.name,
        title: game.title,
        createdAt: game.createdAt,
        kyokuCount: g.publicCount,
        firstLogId: g.latestLogId,
      });
    }
    return { ok: true, items: cards, nextCursor: page.nextCursor };
  }
}
