// application — UpdateKifu（保存済み牌譜の修正を反映）。
// 人が確信度の低い牌を直した結果（Kifu）と局順(seq)を、所有者の局に上書き保存する。
// 下書き/編集済は半荘単位（UpdateGameStatus）で扱うため、ここでは変更しない。

import type { Kifu } from "@rigel/schema";
import type { GameLogRepository } from "../domain/kifu/game-log.repository";

export type UpdateKifuResult = { ok: true } | { ok: false; reason: "not_found" | "invalid_seq" };

/** 局順(seq)の上限。roundNameForSeq が表せる範囲（東一〜北四）に合わせる。 */
export const MAX_SEQ = 16;

export class UpdateKifu {
  constructor(private readonly gameLogs: GameLogRepository) {}

  async execute(params: {
    userId: string;
    logId: string;
    kifu: Kifu;
    /** 局順（東一局=1〜北四局=16）。省略時は現状維持。 */
    seq?: number;
  }): Promise<UpdateKifuResult> {
    const log = await this.gameLogs.findById(params.logId);
    // 他人の牌譜は存在を伏せて not_found。
    if (!log || log.userId !== params.userId) return { ok: false, reason: "not_found" };

    if (
      params.seq !== undefined &&
      (!Number.isInteger(params.seq) || params.seq < 1 || params.seq > MAX_SEQ)
    ) {
      return { ok: false, reason: "invalid_seq" };
    }

    await this.gameLogs.save({ ...log, kifu: params.kifu, seq: params.seq ?? log.seq });
    return { ok: true };
  }
}
