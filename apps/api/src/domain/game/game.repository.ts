// domain/game — Game リポジトリのポート。実体は infrastructure 層（Drizzle/D1）。

import type { Game } from "./game";

export interface GameRepository {
  /** ユーザーの半荘一覧（新しい順）。 */
  listByUser(userId: string): Promise<Game[]>;
  findById(id: string): Promise<Game | null>;
  save(game: Game): Promise<void>;
  /** ユーザーの全半荘を削除（アカウント削除のカスケード）。 */
  deleteByUser(userId: string): Promise<void>;
}
