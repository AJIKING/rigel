// application — UpdateKifu（保存済み牌譜の修正を反映）。
// 人が確信度の低い牌を直した結果（Kifu）を、所有者の局に上書き保存する。

import type { Kifu } from "@rigel/schema";
import type { GameLogRepository } from "../domain/kifu/game-log.repository";

export type UpdateKifuResult = { ok: true } | { ok: false; reason: "not_found" };

export class UpdateKifu {
  constructor(private readonly gameLogs: GameLogRepository) {}

  async execute(params: { userId: string; logId: string; kifu: Kifu }): Promise<UpdateKifuResult> {
    const log = await this.gameLogs.findById(params.logId);
    // 他人の牌譜は存在を伏せて not_found。
    if (!log || log.userId !== params.userId) return { ok: false, reason: "not_found" };
    await this.gameLogs.save({ ...log, kifu: params.kifu });
    return { ok: true };
  }
}
