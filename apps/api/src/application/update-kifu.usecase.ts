// application — UpdateKifu（保存済み牌譜の修正を反映）。
// 人が確信度の低い牌を直した結果（Kifu）と局順(seq)を、所有者の局に上書き保存する。
// 下書き/編集済は半荘単位（UpdateGameStatus）で扱うため、ここでは変更しない。
// 半荘単位で kifu JSON に同居するフィールド（rules/players）も client 値を信用せず
// 保存済みの値を引き継ぐ（書き換え経路を PATCH /games/:id/{rules,players} に一本化。
// 旧クライアントが未知フィールドを strip した kifu を送り返しても局間で乖離しない）。

import type { Kifu } from "@rigel/schema";
import type { GameLogRepository } from "../domain/kifu/game-log.repository";

export type UpdateKifuResult = { ok: true } | { ok: false; reason: "not_found" | "invalid_seq" };

/** 局順(seq)の上限。roundNameForSeq が表せる範囲（東一〜北四）に合わせる。 */
export const MAX_SEQ = 16;

/** seq 省略時の自動採番（既存局数+1）。連荘で局数が16を超えても保存可能な範囲に頭打ちする。 */
export function autoSeq(existingCount: number): number {
  return Math.min(existingCount + 1, MAX_SEQ);
}

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

    await this.gameLogs.save({
      ...log,
      kifu: { ...params.kifu, rules: log.kifu.rules, players: log.kifu.players },
      seq: params.seq ?? log.seq,
    });
    return { ok: true };
  }
}
