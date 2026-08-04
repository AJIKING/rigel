// domain/favorite — お気に入り（★）リポジトリのポート。
// 1人1対象1件（PK = userId + targetType + targetId。二度押しは冪等）。
// API は「件数」と「自分が付けたか」だけを外に出し、誰が付けたかは返さない
// （problem_answers と同じプライバシー原則）。
//
// 対象（半荘・何切る）はポリモーフィックな参照で外部キーが張れないため、
// 対象を消すユースケースが deleteByTarget を、退会が deleteByUser を必ず呼ぶ。

import type { ListCursor } from "@rigel/schema";

/** お気に入りを付けられる対象の種別。 */
export type FavoriteTargetType = "game" | "problem";

export interface Favorite {
  userId: string;
  targetType: FavoriteTargetType;
  targetId: string;
  createdAt: Date;
}

export interface FavoriteRepository {
  /** 付ける（既に付いていれば何もしない＝冪等）。 */
  add(favorite: Favorite): Promise<void>;
  /** 外す（付いていなければ何もしない＝冪等）。 */
  remove(userId: string, targetType: FavoriteTargetType, targetId: string): Promise<void>;
  /** 自分が付けたお気に入りの1ページ（付けた新しい順・同時刻は targetType:targetId DESC。
   *  カーソルより古いもののみ・呼び出し側が pageSize+1 を渡す）。 */
  listByUserPage(userId: string, limit: number, cursor: ListCursor | null): Promise<Favorite[]>;
  /** 対象ごとの件数（表示中のカードぶんだけ引く。0 件の対象はキーごと省く）。 */
  countsByTargets(
    targetType: FavoriteTargetType,
    targetIds: readonly string[],
  ): Promise<Record<string, number>>;
  /** 指定した対象のうち、自分が付けている targetId の集合。 */
  findMineIn(
    userId: string,
    targetType: FavoriteTargetType,
    targetIds: readonly string[],
  ): Promise<Set<string>>;
  /** 1つの対象に付いた全員ぶんを削除（半荘・問題の削除時。孤児を残さない）。 */
  deleteByTarget(targetType: FavoriteTargetType, targetId: string): Promise<void>;
  /** 自分が付けた全件を削除（退会時）。 */
  deleteByUser(userId: string): Promise<void>;
}
