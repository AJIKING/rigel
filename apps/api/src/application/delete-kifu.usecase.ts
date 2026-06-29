// application — 牌譜（局）を削除するユースケース。所有者のみ。

import type { GameLogRepository } from "../domain/kifu/game-log.repository";

export type DeleteKifuResult = { ok: true } | { ok: false; reason: "not_found" };

export class DeleteKifu {
  constructor(private readonly gameLogs: GameLogRepository) {}

  async execute(params: { userId: string; logId: string }): Promise<DeleteKifuResult> {
    const log = await this.gameLogs.findById(params.logId);
    if (!log || log.userId !== params.userId) return { ok: false, reason: "not_found" };
    await this.gameLogs.deleteById(params.logId);
    return { ok: true };
  }
}
