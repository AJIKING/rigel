// application — UpdateKifu（保存済み牌譜の修正を反映）。
// 人が確信度の低い牌を直した結果（Kifu）＋編集状態(status)を、所有者の局に上書き保存する。
// 状態遷移で上限を判定する（complete→draft=下書き上限 / draft→complete かつ private=非公開上限）。

import type { Kifu } from "@rigel/schema";
import type { KifuStatus } from "../domain/kifu/game-log";
import type { GameLogRepository } from "../domain/kifu/game-log.repository";
import { draftLimit, privateKifuLimit } from "../domain/user/user";
import type { UserRepository } from "../domain/user/user.repository";
import { isOverLimit } from "./limits";

export type UpdateKifuResult =
  { ok: true } | { ok: false; reason: "not_found" | "draft_limit" | "private_limit" };

export class UpdateKifu {
  constructor(
    private readonly gameLogs: GameLogRepository,
    private readonly users: UserRepository,
  ) {}

  async execute(params: {
    userId: string;
    logId: string;
    kifu: Kifu;
    /** 編集状態。省略時は現状維持。 */
    status?: KifuStatus;
  }): Promise<UpdateKifuResult> {
    const log = await this.gameLogs.findById(params.logId);
    // 他人の牌譜は存在を伏せて not_found。
    if (!log || log.userId !== params.userId) return { ok: false, reason: "not_found" };
    const status = params.status ?? log.status;

    // complete → draft: 下書き上限（無料）。
    if (
      status === "draft" &&
      log.status === "complete" &&
      (await isOverLimit(this.users, params.userId, draftLimit, () =>
        this.gameLogs.countByUserAndStatus(params.userId, "draft"),
      ))
    ) {
      return { ok: false, reason: "draft_limit" };
    }

    // draft → complete かつ private: 非公開上限（無料。complete×private のみ数える）。
    if (
      status === "complete" &&
      log.status !== "complete" &&
      log.visibility === "private" &&
      (await isOverLimit(this.users, params.userId, privateKifuLimit, () =>
        this.gameLogs.countByUserVisibilityStatus(params.userId, "private", "complete"),
      ))
    ) {
      return { ok: false, reason: "private_limit" };
    }

    await this.gameLogs.save({ ...log, kifu: params.kifu, status });
    return { ok: true };
  }
}
