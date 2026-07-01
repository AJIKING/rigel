// application — 空の局（手動入力の起点）を半荘に追加するユースケース。
// 解析を伴わないので Gemini 枠は消費しない。既定 private なので無料の非公開上限は守る。

import { KifuSchema, type Kifu, type Seat, type Tile } from "@rigel/schema";
import type { GameRepository } from "../domain/game/game.repository";
import type { GameLog } from "../domain/kifu/game-log";
import type { GameLogRepository } from "../domain/kifu/game-log.repository";
import { privateKifuLimit } from "../domain/user/user";
import type { UserRepository } from "../domain/user/user.repository";

/** 作成時に焼き込める局メタ（写真に写らない情報。記録のみ・点数計算はしない）。 */
export type EmptyKifuMeta = Partial<Kifu["meta"]>;

export type CreateEmptyResult =
  | { ok: true; gameId: string; logId: string }
  | { ok: false; reason: "game_not_found" | "private_limit" };

/** 手動作成の下敷き牌（1m→字牌の自然順・赤ドラ除く。34種）。 */
const TILE_SEQUENCE = [
  "1m",
  "2m",
  "3m",
  "4m",
  "5m",
  "6m",
  "7m",
  "8m",
  "9m",
  "1p",
  "2p",
  "3p",
  "4p",
  "5p",
  "6p",
  "7p",
  "8p",
  "9p",
  "1s",
  "2s",
  "3s",
  "4s",
  "5s",
  "6s",
  "7s",
  "8s",
  "9s",
  "1z",
  "2z",
  "3z",
  "4z",
  "5z",
  "6z",
  "7z",
] as const satisfies readonly Tile[];
/** 配牌（手牌）枚数。 */
const HAND_SIZE = 13;

const seqTile = (i: number): Tile => TILE_SEQUENCE[i % TILE_SEQUENCE.length]!;

/**
 * 手動作成の下敷き Kifu を作る。各席に配牌13枚と、最終巡目(junme)ぶんの捨て牌を
 * 1m から順（字牌まで）でプレースホルダとして並べる。人がここから正しい牌に直す。
 * AI 解析は別経路なので影響しない。meta は省略時に既定が入る。
 */
export function emptyKifu(capturedAt: string, cameraBottomSeat: Seat, meta?: EmptyKifuMeta): Kifu {
  const junme = meta?.junme ?? 1;
  const seatBoard = () => ({
    hand: Array.from({ length: HAND_SIZE }, (_, i) => ({ tile: seqTile(i), confidence: 1 })),
    melds: [],
    river: Array.from({ length: junme }, (_, i) => ({ order: i + 1, tile: seqTile(i) })),
  });
  return KifuSchema.parse({
    schemaVersion: "1.0.0",
    capturedAt,
    cameraBottomSeat,
    seats: { east: seatBoard(), south: seatBoard(), west: seatBoard(), north: seatBoard() },
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
