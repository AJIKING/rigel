// application — ユーザープロフィール（設定・別ユーザーページ）。
//   UpdateProfile: handle/表示名/公開を更新（handle は形式＋一意を検証）。
//   GetPublicProfile: handle か id で公開プロフィール＋公開半荘を取得。
//   DeleteAccount: 自分の牌譜・半荘・ユーザーを削除（カスケード）。

import type { GameRepository } from "../domain/game/game.repository";
import type { GameLogRepository } from "../domain/kifu/game-log.repository";
import type { UserRepository } from "../domain/user/user.repository";
import type { PublicGameCard } from "./list-game-cards.usecase";

/** 英数字とアンダースコア、3〜20文字。 */
const HANDLE_RE = /^[a-zA-Z0-9_]{3,20}$/;

export type UpdateProfileResult =
  { ok: true } | { ok: false; reason: "not_found" | "invalid_handle" | "handle_taken" };

export class UpdateProfile {
  constructor(private readonly users: UserRepository) {}

  async execute(params: {
    userId: string;
    handle?: string | null;
    displayName?: string;
    profilePublic?: boolean;
  }): Promise<UpdateProfileResult> {
    const user = await this.users.findById(params.userId);
    if (!user) return { ok: false, reason: "not_found" };

    let handle = params.handle;
    if (handle !== undefined) {
      handle = handle === "" ? null : handle;
      if (handle !== null) {
        if (!HANDLE_RE.test(handle)) return { ok: false, reason: "invalid_handle" };
        const taken = await this.users.findByHandle(handle);
        if (taken && taken.id !== user.id) return { ok: false, reason: "handle_taken" };
      }
    }

    user.updateProfile({
      handle,
      displayName: params.displayName,
      profilePublic: params.profilePublic,
    });
    await this.users.save(user);
    return { ok: true };
  }
}

export interface PublicProfile {
  id: string;
  handle: string | null;
  displayName: string;
  /** その人の公開半荘（新着順）。 */
  games: PublicGameCard[];
}

export class GetPublicProfile {
  constructor(
    private readonly users: UserRepository,
    private readonly games: GameRepository,
    private readonly gameLogs: GameLogRepository,
  ) {}

  /** handle 優先で解決し、無ければ id で探す。非公開プロフィールは null。 */
  async execute(idOrHandle: string): Promise<PublicProfile | null> {
    const user =
      (await this.users.findByHandle(idOrHandle)) ?? (await this.users.findById(idOrHandle));
    if (!user || !user.profilePublic) return null;

    const userGames = await this.games.listByUser(user.id);
    const cards: PublicGameCard[] = [];
    for (const g of userGames) {
      const logs = await this.gameLogs.listByGame(g.id);
      const pubCount = logs.filter((l) => l.visibility === "public").length;
      if (pubCount > 0) {
        cards.push({
          id: g.id,
          ownerId: user.id,
          title: g.title,
          createdAt: g.createdAt,
          kyokuCount: pubCount,
        });
      }
    }
    cards.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    return { id: user.id, handle: user.handle, displayName: user.displayName, games: cards };
  }
}

export class DeleteAccount {
  constructor(
    private readonly users: UserRepository,
    private readonly games: GameRepository,
    private readonly gameLogs: GameLogRepository,
  ) {}

  async execute(userId: string): Promise<{ ok: boolean }> {
    const user = await this.users.findById(userId);
    if (!user) return { ok: false };
    await this.gameLogs.deleteByUser(userId);
    await this.games.deleteByUser(userId);
    await this.users.deleteById(userId);
    return { ok: true };
  }
}
