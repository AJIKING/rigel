// テスト用の in-memory リポジトリ（ポートのフェイク実装）。本番バンドルには含まれない。

import type { AnalysisCommitInput, AnalysisStore } from "../domain/analysis/analysis-store";
import type { Game } from "../domain/game/game";
import type { GameRepository } from "../domain/game/game.repository";
import type { GameLog, Visibility } from "../domain/kifu/game-log";
import type { GameLogRepository } from "../domain/kifu/game-log.repository";
import type { User } from "../domain/user/user";
import type { UserRepository } from "../domain/user/user.repository";

export class InMemoryUserRepository implements UserRepository {
  private byId = new Map<string, User>();

  constructor(seed: User[] = []) {
    for (const u of seed) this.byId.set(u.id, u);
  }

  findById(id: string): Promise<User | null> {
    return Promise.resolve(this.byId.get(id) ?? null);
  }

  findByGoogleSub(googleSub: string): Promise<User | null> {
    for (const u of this.byId.values()) {
      if (u.googleSub === googleSub) return Promise.resolve(u);
    }
    return Promise.resolve(null);
  }

  save(user: User): Promise<void> {
    this.byId.set(user.id, user);
    return Promise.resolve();
  }

  get size(): number {
    return this.byId.size;
  }
}

export class InMemoryGameLogRepository implements GameLogRepository {
  readonly saved: GameLog[] = [];

  save(gameLog: GameLog): Promise<void> {
    // 実 Drizzle 実装(onConflictDoUpdate)に合わせて id で upsert する。
    const i = this.saved.findIndex((g) => g.id === gameLog.id);
    if (i >= 0) this.saved[i] = gameLog;
    else this.saved.push(gameLog);
    return Promise.resolve();
  }

  findById(id: string): Promise<GameLog | null> {
    return Promise.resolve(this.saved.find((g) => g.id === id) ?? null);
  }

  listByUser(userId: string): Promise<GameLog[]> {
    return Promise.resolve(this.saved.filter((g) => g.userId === userId));
  }

  listByGame(gameId: string): Promise<GameLog[]> {
    return Promise.resolve(
      this.saved.filter((g) => g.gameId === gameId).sort((a, b) => a.seq - b.seq),
    );
  }

  countByUserAndVisibility(userId: string, visibility: Visibility): Promise<number> {
    return Promise.resolve(
      this.saved.filter((g) => g.userId === userId && g.visibility === visibility).length,
    );
  }

  deleteById(id: string): Promise<void> {
    const i = this.saved.findIndex((g) => g.id === id);
    if (i >= 0) this.saved.splice(i, 1);
    return Promise.resolve();
  }
}

export class InMemoryGameRepository implements GameRepository {
  private byId = new Map<string, Game>();

  constructor(seed: Game[] = []) {
    for (const g of seed) this.byId.set(g.id, g);
  }

  listByUser(userId: string): Promise<Game[]> {
    return Promise.resolve([...this.byId.values()].filter((g) => g.userId === userId));
  }

  findById(id: string): Promise<Game | null> {
    return Promise.resolve(this.byId.get(id) ?? null);
  }

  save(game: Game): Promise<void> {
    this.byId.set(game.id, game);
    return Promise.resolve();
  }
}

/** 原子コミットのフェイク（テスト用）。実 D1 batch の代わりに各 in-memory リポジトリへ書く。 */
export class InMemoryAnalysisStore implements AnalysisStore {
  constructor(
    private readonly games: InMemoryGameRepository,
    private readonly gameLogs: InMemoryGameLogRepository,
    private readonly users: InMemoryUserRepository,
  ) {}

  async commit({ newGame, gameLog, user }: AnalysisCommitInput): Promise<void> {
    if (newGame) await this.games.save(newGame);
    await this.gameLogs.save(gameLog);
    await this.users.save(user);
  }
}
