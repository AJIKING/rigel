// application — お気に入り（★）のユースケース。
//   SetFavorite         : 付ける/外す（対象が「その人に見えるもの」であることを確認してから書く）
//   GetFavoriteSummary  : 一覧カードに載せる件数＋自分が付けたか（表示中のぶんだけ引く）
//   ListMyFavorites     : 自分のお気に入り一覧（他人の投稿も含む。今見られないものは落とす）
//
// 誰が付けたかは一切外に出さない（件数と「自分が付けたか」だけ。problem_answers と同じ原則）。
// 対象はポリモーフィック（半荘 / 何切る）で外部キーが張れないため、
// 対象削除・退会での掃除は DeleteGame / DeleteProblem / DeleteAccount 側の責務。

import type {
  FavoriteRepository,
  FavoriteTargetType,
} from "../domain/favorite/favorite.repository";
import type { GameRepository } from "../domain/game/game.repository";
import type { GameLogRepository } from "../domain/kifu/game-log.repository";
import type { ProblemPost } from "../domain/problem/problem";
import type { ProblemRepository } from "../domain/problem/problem.repository";
import type { UserRepository } from "../domain/user/user.repository";
import type { PublicGameCard } from "./list-game-cards.usecase";
import { fetchPage } from "./pagination";

/** 自分のお気に入り一覧に出す半荘カード（公開カード＋自分のものか＋お気に入り数）。 */
export interface FavoriteGameCard extends PublicGameCard {
  /** 自分が所有する半荘か（非公開でも自分のものは一覧に出し、編集画面へ開く）。 */
  mine: boolean;
  favoriteCount: number;
}

/** 自分のお気に入り一覧に出す何切るカード。 */
export interface FavoriteProblemCard extends ProblemPost {
  mine: boolean;
  favoriteCount: number;
  /** 著者ハンドル（未設定なら null）。 */
  ownerHandle: string | null;
  ownerName: string | null;
}

export type SetFavoriteResult =
  { ok: true; favoriteCount: number } | { ok: false; reason: "not_found" };

/** 対象が「その閲覧者に見えるか」。見えないものはお気に入りに付けられない
 *  （非公開・下書きの存在を、付けられる/付けられないの差で漏らさない＝どちらも not_found）。 */
async function canView(
  deps: { games: GameRepository; gameLogs: GameLogRepository; problems: ProblemRepository },
  viewerId: string,
  targetType: FavoriteTargetType,
  targetId: string,
): Promise<boolean> {
  if (targetType === "problem") {
    const post = await deps.problems.findById(targetId);
    if (!post) return false;
    return post.status === "published" || post.userId === viewerId;
  }
  const game = await deps.games.findById(targetId);
  if (!game) return false;
  if (game.userId === viewerId) return true;
  const logs = await deps.gameLogs.listByGame(targetId);
  return logs.some((l) => l.visibility === "public" && l.status === "complete");
}

export class SetFavorite {
  constructor(
    private readonly deps: {
      favorites: FavoriteRepository;
      games: GameRepository;
      gameLogs: GameLogRepository;
      problems: ProblemRepository;
      now: () => Date;
    },
  ) {}

  async execute(params: {
    userId: string;
    targetType: FavoriteTargetType;
    targetId: string;
    /** true=付ける / false=外す。 */
    faved: boolean;
  }): Promise<SetFavoriteResult> {
    const { userId, targetType, targetId, faved } = params;
    if (!(await canView(this.deps, userId, targetType, targetId))) {
      return { ok: false, reason: "not_found" };
    }
    if (faved) {
      await this.deps.favorites.add({
        userId,
        targetType,
        targetId,
        createdAt: this.deps.now(),
      });
    } else {
      await this.deps.favorites.remove(userId, targetType, targetId);
    }
    const counts = await this.deps.favorites.countsByTargets(targetType, [targetId]);
    return { ok: true, favoriteCount: counts[targetId] ?? 0 };
  }
}

/** 一覧カードに重ねる集計。未ログイン（viewerId 無し）でも件数は返す。 */
export interface FavoriteSummary {
  /** targetId → 件数（0 件の対象はキーごと省く）。 */
  counts: Record<string, number>;
  /** 自分が付けている targetId（未ログインは空）。 */
  mine: string[];
}

export class GetFavoriteSummary {
  constructor(private readonly favorites: FavoriteRepository) {}

  async execute(params: {
    viewerId?: string;
    targetType: FavoriteTargetType;
    targetIds: readonly string[];
  }): Promise<FavoriteSummary> {
    const { viewerId, targetType, targetIds } = params;
    const counts = await this.favorites.countsByTargets(targetType, targetIds);
    const mine = viewerId
      ? [...(await this.favorites.findMineIn(viewerId, targetType, targetIds))]
      : [];
    return { counts, mine };
  }
}

/** お気に入り一覧のページサイズ（Plan: docs/plans/list-pagination.md 3-3）。 */
const FAVORITES_PAGE_SIZE = 30;

export type ListMyFavoritesResult =
  | {
      ok: true;
      games: FavoriteGameCard[];
      problems: FavoriteProblemCard[];
      nextCursor: string | null;
    }
  | { ok: false; reason: "invalid" };

export class ListMyFavorites {
  constructor(
    private readonly deps: {
      favorites: FavoriteRepository;
      games: GameRepository;
      gameLogs: GameLogRepository;
      problems: ProblemRepository;
      users: UserRepository;
    },
  ) {}

  async execute(userId: string, cursorRaw?: string): Promise<ListMyFavoritesResult> {
    // ページは「付けた順」の混在1本（半荘/何切るへは返却時に振り分ける。カーソルの id 部は
    // targetType:targetId の複合キー）。
    const page = await fetchPage(
      cursorRaw,
      FAVORITES_PAGE_SIZE,
      (limit, cursor) => this.deps.favorites.listByUserPage(userId, limit, cursor),
      (f) => ({ ms: f.createdAt.getTime(), id: `${f.targetType}:${f.targetId}` }),
    );
    if (!page.ok) return page;
    const favs = page.items;
    const gameIds = favs.filter((f) => f.targetType === "game").map((f) => f.targetId);
    const problemIds = favs.filter((f) => f.targetType === "problem").map((f) => f.targetId);

    const [gameCounts, problemCounts] = await Promise.all([
      this.deps.favorites.countsByTargets("game", gameIds),
      this.deps.favorites.countsByTargets("problem", problemIds),
    ]);

    // 著者は同一ユーザーが複数持つので userId でキャッシュして重複取得を避ける。
    const ownerCache = new Map<string, { handle: string | null; name: string | null }>();
    const resolveOwner = async (ownerId: string) => {
      const cached = ownerCache.get(ownerId);
      if (cached) return cached;
      const user = await this.deps.users.findById(ownerId);
      const author = user
        ? { handle: user.handle ?? null, name: user.displayName || null }
        : { handle: null, name: null };
      ownerCache.set(ownerId, author);
      return author;
    };

    // 半荘: 消えた・非公開に戻された他人の半荘は落とす（自分のものは非公開でも出す）。
    const games: FavoriteGameCard[] = [];
    for (const id of gameIds) {
      const game = await this.deps.games.findById(id);
      if (!game) continue;
      const mine = game.userId === userId;
      const logs = await this.deps.gameLogs.listByGame(id);
      const publicLogs = logs.filter((l) => l.visibility === "public" && l.status === "complete");
      if (!mine && publicLogs.length === 0) continue;
      const owner = await resolveOwner(game.userId);
      games.push({
        id: game.id,
        ownerId: game.userId,
        ownerHandle: owner.handle,
        ownerName: owner.name,
        title: game.title,
        createdAt: game.createdAt,
        // 他人の半荘は公開局だけ、自分の半荘は全局を数える（各一覧の表示と揃える）。
        kyokuCount: mine ? logs.length : publicLogs.length,
        firstLogId: (publicLogs[0] ?? logs[0])?.id ?? "",
        mine,
        favoriteCount: gameCounts[id] ?? 0,
      });
    }

    // 何切る: 下書きに戻された・消えた他人の問題は落とす。
    const problems: FavoriteProblemCard[] = [];
    for (const id of problemIds) {
      const post = await this.deps.problems.findById(id);
      if (!post) continue;
      const mine = post.userId === userId;
      if (!mine && post.status !== "published") continue;
      const owner = await resolveOwner(post.userId);
      problems.push({
        ...post,
        mine,
        favoriteCount: problemCounts[id] ?? 0,
        ownerHandle: owner.handle,
        ownerName: owner.name,
      });
    }

    return { ok: true, games, problems, nextCursor: page.nextCursor };
  }
}
