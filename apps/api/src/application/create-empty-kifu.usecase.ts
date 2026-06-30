// application — 空の局（手動入力の起点）を半荘に追加するユースケース。
// 解析を伴わないので Gemini 枠は消費しない。既定 private なので無料の非公開上限は守る。

import { KifuSchema, type Kifu, type Seat } from "@rigel/schema";

/** 作成時に焼き込める局メタ（写真に写らない情報。記録のみ・点数計算はしない）。 */
export type EmptyKifuMeta = Partial<Kifu["meta"]>;
import type { GameRepository } from "../domain/game/game.repository";
import type { GameLog } from "../domain/kifu/game-log";
import type { GameLogRepository } from "../domain/kifu/game-log.repository";
import { privateKifuLimit } from "../domain/user/user";
import type { UserRepository } from "../domain/user/user.repository";

export type CreateEmptyResult =
  | { ok: true; gameId: string; logId: string }
  | { ok: false; reason: "game_not_found" | "private_limit" };

/** 全席空の Kifu を作る。meta（本場/供託/ドラ/最終巡目など）は省略時に既定が入る。 */
export function emptyKifu(capturedAt: string, cameraBottomSeat: Seat, meta?: EmptyKifuMeta): Kifu {
  return KifuSchema.parse({
    schemaVersion: "1.0.0",
    capturedAt,
    cameraBottomSeat,
    seats: { east: {}, south: {}, west: {}, north: {} },
    meta: meta ?? {},
  });
}

export interface CreateEmptyDeps {
  games: GameRepository;
  gameLogs: GameLogRepository;
  users: UserRepository;
  now: () => Date;
  newId: () => string;
}

export class CreateEmptyKifu {
  constructor(private readonly deps: CreateEmptyDeps) {}

  async execute(params: {
    userId: string;
    /** 既存半荘に追加する場合は指定。無指定なら新しい半荘を作る（手動入力の起点）。 */
    gameId?: string;
    cameraBottomSeat: Seat;
    /** 作成時に焼き込む局メタ（本場/供託/ドラ/最終巡目）。省略時は既定。 */
    meta?: EmptyKifuMeta;
  }): Promise<CreateEmptyResult> {
    const { games, gameLogs, users, now, newId } = this.deps;

    // 既存半荘なら所有者確認。新規なら後で作る。
    let game = params.gameId ? await games.findById(params.gameId) : null;
    if (params.gameId && (!game || game.userId !== params.userId)) {
      return { ok: false, reason: "game_not_found" };
    }

    const user = await users.findById(params.userId);
    const limit = user ? privateKifuLimit(user.plan) : 0;
    if (limit !== null) {
      const current = await gameLogs.countByUserAndVisibility(params.userId, "private");
      if (current >= limit) return { ok: false, reason: "private_limit" };
    }

    // 上限を通過してから半荘を作る（弾かれた時に空半荘を残さない）。
    if (!game) {
      game = { id: newId(), userId: params.userId, title: "", createdAt: now() };
      await games.save(game);
    }

    const existing = await gameLogs.listByGame(game.id);
    const log: GameLog = {
      id: newId(),
      userId: params.userId,
      gameId: game.id,
      seq: existing.length + 1,
      kifu: emptyKifu(now().toISOString(), params.cameraBottomSeat, params.meta),
      visibility: "private",
      createdAt: now(),
    };
    await gameLogs.save(log);
    return { ok: true, gameId: game.id, logId: log.id };
  }
}
