// テスト用の in-memory リポジトリ（ポートのフェイク実装）。本番バンドルには含まれない。

import type { AnalysisCommitInput, AnalysisStore } from "../domain/analysis/analysis-store";
import type { RevenueCatEventRepository } from "../domain/billing/revenuecat";
import type { Game } from "../domain/game/game";
import type { GameRepository } from "../domain/game/game.repository";
import type { GameLog, KifuStatus, Visibility } from "../domain/kifu/game-log";
import type { GameLogRepository } from "../domain/kifu/game-log.repository";
import type { ProblemPost } from "../domain/problem/problem";
import type {
  ProblemAnswer,
  ProblemAnswerRepository,
} from "../domain/problem/problem-answer.repository";
import type { ProblemRepository } from "../domain/problem/problem.repository";
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

  findByHandle(handle: string): Promise<User | null> {
    for (const u of this.byId.values()) {
      if (u.handle === handle) return Promise.resolve(u);
    }
    return Promise.resolve(null);
  }

  save(user: User): Promise<void> {
    this.byId.set(user.id, user);
    return Promise.resolve();
  }

  deleteById(id: string): Promise<void> {
    this.byId.delete(id);
    return Promise.resolve();
  }

  get size(): number {
    return this.byId.size;
  }
}

export class InMemoryRevenueCatEventRepository implements RevenueCatEventRepository {
  private processed = new Set<string>();

  isProcessed(eventId: string): Promise<boolean> {
    return Promise.resolve(this.processed.has(eventId));
  }

  markProcessed(eventId: string): Promise<void> {
    this.processed.add(eventId);
    return Promise.resolve();
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

  countGamesByUserAndStatus(
    userId: string,
    status: KifuStatus,
    excludeGameId?: string,
  ): Promise<number> {
    const games = new Set(
      this.saved
        .filter((g) => g.userId === userId && g.status === status && g.gameId !== excludeGameId)
        .map((g) => g.gameId),
    );
    return Promise.resolve(games.size);
  }

  countGamesByUserVisibilityStatus(
    userId: string,
    visibility: Visibility,
    status: KifuStatus,
    excludeGameId?: string,
  ): Promise<number> {
    const games = new Set(
      this.saved
        .filter(
          (g) =>
            g.userId === userId &&
            g.visibility === visibility &&
            g.status === status &&
            g.gameId !== excludeGameId,
        )
        .map((g) => g.gameId),
    );
    return Promise.resolve(games.size);
  }

  listPublic(limit: number): Promise<GameLog[]> {
    return Promise.resolve(
      this.saved
        .filter((g) => g.visibility === "public" && g.status === "complete")
        .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
        .slice(0, limit),
    );
  }

  deleteById(id: string): Promise<void> {
    const i = this.saved.findIndex((g) => g.id === id);
    if (i >= 0) this.saved.splice(i, 1);
    return Promise.resolve();
  }

  deleteByGame(gameId: string): Promise<void> {
    for (let i = this.saved.length - 1; i >= 0; i--) {
      if (this.saved[i]!.gameId === gameId) this.saved.splice(i, 1);
    }
    return Promise.resolve();
  }

  deleteByUser(userId: string): Promise<void> {
    for (let i = this.saved.length - 1; i >= 0; i--) {
      if (this.saved[i]!.userId === userId) this.saved.splice(i, 1);
    }
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

  deleteById(id: string): Promise<void> {
    this.byId.delete(id);
    return Promise.resolve();
  }

  deleteByUser(userId: string): Promise<void> {
    for (const [id, g] of this.byId) {
      if (g.userId === userId) this.byId.delete(id);
    }
    return Promise.resolve();
  }
}

export class InMemoryProblemRepository implements ProblemRepository {
  private byId = new Map<string, ProblemPost>();

  constructor(seed: ProblemPost[] = []) {
    for (const p of seed) this.byId.set(p.id, p);
  }

  listByUser(userId: string): Promise<ProblemPost[]> {
    return Promise.resolve([...this.byId.values()].filter((p) => p.userId === userId));
  }

  listPublished(limit: number): Promise<ProblemPost[]> {
    return Promise.resolve(
      [...this.byId.values()]
        .filter((p) => p.status === "published")
        .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
        .slice(0, limit),
    );
  }

  findById(id: string): Promise<ProblemPost | null> {
    return Promise.resolve(this.byId.get(id) ?? null);
  }

  countByUser(userId: string): Promise<number> {
    return Promise.resolve([...this.byId.values()].filter((p) => p.userId === userId).length);
  }

  save(post: ProblemPost): Promise<void> {
    this.byId.set(post.id, post);
    return Promise.resolve();
  }

  deleteById(id: string): Promise<void> {
    this.byId.delete(id);
    return Promise.resolve();
  }

  deleteByUser(userId: string): Promise<void> {
    for (const [id, p] of this.byId) {
      if (p.userId === userId) this.byId.delete(id);
    }
    return Promise.resolve();
  }
}

export class InMemoryProblemAnswerRepository implements ProblemAnswerRepository {
  private rows: ProblemAnswer[] = [];
  /** deleteByProblemOwner のためだけに問題→所有者を引く（省略時はスキップ）。 */
  constructor(private readonly problems?: InMemoryProblemRepository) {}

  upsert(answer: ProblemAnswer): Promise<void> {
    const i = this.rows.findIndex(
      (a) => a.problemId === answer.problemId && a.userId === answer.userId,
    );
    if (i >= 0) this.rows[i] = answer;
    else this.rows.push(answer);
    return Promise.resolve();
  }

  countsByProblem(problemId: string): Promise<Record<string, number>> {
    const counts: Record<string, number> = {};
    for (const a of this.rows) {
      if (a.problemId === problemId) counts[a.choiceKey] = (counts[a.choiceKey] ?? 0) + 1;
    }
    return Promise.resolve(counts);
  }

  findMine(problemId: string, userId: string): Promise<ProblemAnswer | null> {
    return Promise.resolve(
      this.rows.find((a) => a.problemId === problemId && a.userId === userId) ?? null,
    );
  }

  deleteByProblem(problemId: string): Promise<void> {
    this.rows = this.rows.filter((a) => a.problemId !== problemId);
    return Promise.resolve();
  }

  deleteByUser(userId: string): Promise<void> {
    this.rows = this.rows.filter((a) => a.userId !== userId);
    return Promise.resolve();
  }

  async deleteByProblemOwner(ownerId: string): Promise<void> {
    const owned = new Set((await this.problems?.listByUser(ownerId))?.map((p) => p.id) ?? []);
    this.rows = this.rows.filter((a) => !owned.has(a.problemId));
  }
}

/** 原子コミットのフェイク（テスト用）。実 D1 batch の代わりに各 in-memory リポジトリへ書く。 */
export class InMemoryAnalysisStore implements AnalysisStore {
  constructor(
    private readonly games: InMemoryGameRepository,
    private readonly gameLogs: InMemoryGameLogRepository,
    private readonly users: InMemoryUserRepository,
  ) {}

  async commit({ newGame, gameLog, counter }: AnalysisCommitInput): Promise<void> {
    if (newGame) await this.games.save(newGame);
    await this.gameLogs.save(gameLog);
    // 本物（SQL の加算）と同じ意味になるよう、保存済みの状態に差分を適用する
    //（月境界のリセット判定はドメイン＝User.recordGeminiCalls が持つ）。
    const user = await this.users.findById(counter.userId);
    if (!user) return;
    user.recordGeminiCalls(counter.now, counter.calls);
    await this.users.save(user);
  }
}
