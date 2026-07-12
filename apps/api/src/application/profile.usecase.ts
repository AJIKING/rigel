// application — ユーザープロフィール（設定・別ユーザーページ）。
//   UpdateProfile: handle/表示名/公開を更新（handle は形式＋一意を検証）。
//   GetPublicProfile: handle か id で公開プロフィール＋公開半荘を取得。
//   DeleteAccount: 自分の牌譜・半荘・ユーザーを削除（カスケード）。

import { KIFU_LIMITS } from "@rigel/schema";
import type { GameRepository } from "../domain/game/game.repository";
import type { GameLogRepository } from "../domain/kifu/game-log.repository";
import type { AccountStore } from "../domain/user/account-store";
import type { UserRepository } from "../domain/user/user.repository";
import type { PublicGameCard } from "./list-game-cards.usecase";

/** 英数字とアンダースコア、3〜20文字。 */
const HANDLE_RE = /^[a-zA-Z0-9_]{3,20}$/;

export type UpdateProfileResult =
  | { ok: true }
  | {
      ok: false;
      reason: "not_found" | "invalid_handle" | "invalid_display_name" | "handle_taken";
    };

export class UpdateProfile {
  constructor(private readonly users: UserRepository) {}

  async execute(params: {
    userId: string;
    handle?: string | null;
    displayName?: string;
  }): Promise<UpdateProfileResult> {
    const user = await this.users.findById(params.userId);
    if (!user) return { ok: false, reason: "not_found" };

    // 表示名は公開プロフィール・OGP に載り、無制限だと D1・レスポンスを膨らませられる。
    if (params.displayName !== undefined && params.displayName.length > KIFU_LIMITS.displayName) {
      return { ok: false, reason: "invalid_display_name" };
    }

    let handle = params.handle;
    if (handle !== undefined) {
      handle = handle === "" ? null : handle;
      if (handle !== null) {
        if (!HANDLE_RE.test(handle)) return { ok: false, reason: "invalid_handle" };
        const taken = await this.users.findByHandle(handle);
        if (taken && taken.id !== user.id) return { ok: false, reason: "handle_taken" };
      }
    }

    user.updateProfile({ handle, displayName: params.displayName });
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

  /** handle 優先で解決し、無ければ id で探す。存在しなければ null（プロフィールは常に公開）。 */
  async execute(idOrHandle: string): Promise<PublicProfile | null> {
    const user =
      (await this.users.findByHandle(idOrHandle)) ?? (await this.users.findById(idOrHandle));
    if (!user) return null;

    const userGames = await this.games.listByUser(user.id);
    const cards: PublicGameCard[] = [];
    for (const g of userGames) {
      const logs = await this.gameLogs.listByGame(g.id);
      const publicLogs = logs
        .filter((l) => l.visibility === "public")
        .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
      if (publicLogs.length > 0) {
        cards.push({
          id: g.id,
          ownerId: user.id,
          ownerHandle: user.handle,
          ownerName: user.displayName || null,
          title: g.title,
          createdAt: g.createdAt,
          kyokuCount: publicLogs.length,
          firstLogId: publicLogs[0]!.id,
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
    private readonly store: AccountStore,
  ) {}

  async execute(userId: string): Promise<DeleteAccountResult> {
    const user = await this.users.findById(userId);
    if (!user) return { ok: false, reason: "not_found" };
    // 有料プラン契約中は削除させない（サブスクを止めないまま消えると請求が残るため）。
    // 解約して free に戻してから削除する導線にする。
    if (user.plan !== "free") return { ok: false, reason: "paid_plan" };
    // 削除は1トランザクション（回答→問題→局→半荘→ユーザー）。個別に順次消すと
    // 途中失敗で中途半端に消えた孤児が残る。
    await this.store.deleteAll(userId);
    return { ok: true };
  }
}

export type DeleteAccountResult = { ok: true } | { ok: false; reason: "not_found" | "paid_plan" };
