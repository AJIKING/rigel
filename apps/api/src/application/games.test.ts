import { describe, expect, it } from "vitest";
import type { Game } from "../domain/game/game";
import type { GameLog } from "../domain/kifu/game-log";
import { InMemoryGameLogRepository, InMemoryGameRepository } from "../test-support/in-memory";
import { InMemoryAnalysisJobRepository } from "../test-support/in-memory-analysis";
import { validKifu } from "../test-support/kifu";
import { GetGameWithLogs } from "./get-game-with-logs.usecase";

const NOW = new Date("2026-06-28T00:00:00.000Z");
const game = (id: string, userId: string): Game => ({ id, userId, title: "", createdAt: NOW });
const log = (id: string, gameId: string, seq: number): GameLog => ({
  id,
  userId: "u1",
  gameId,
  seq,
  kifu: validKifu,
  visibility: "private",
  status: "complete",
  createdAt: NOW,
});

describe("GetGameWithLogs", () => {
  it("半荘とその局を seq 順で返す", async () => {
    const games = new InMemoryGameRepository([game("g1", "u1")]);
    const logs = new InMemoryGameLogRepository();
    await logs.save(log("l2", "g1", 2));
    await logs.save(log("l1", "g1", 1));
    await logs.save(log("other", "g2", 1));

    const detail = await new GetGameWithLogs(
      games,
      logs,
      new InMemoryAnalysisJobRepository(),
    ).execute("g1", "u1");
    expect(detail?.game.id).toBe("g1");
    expect(detail?.logs.map((l) => l.id)).toEqual(["l1", "l2"]);
  });

  it("存在しない半荘は null", async () => {
    const detail = await new GetGameWithLogs(
      new InMemoryGameRepository(),
      new InMemoryGameLogRepository(),
      new InMemoryAnalysisJobRepository(),
    ).execute("nope", "u1");
    expect(detail).toBeNull();
  });

  // 半荘詳細は所有者のみ。他人・未ログインには不存在と同じ null（存在を漏らさない）。
  it.each<{ name: string; viewerId: string | null; visible: boolean }>([
    { name: "所有者本人は詳細を取得できる", viewerId: "u1", visible: true },
    { name: "他人には null（存在を漏らさない）", viewerId: "other", visible: false },
    { name: "未ログインには null（存在を漏らさない）", viewerId: null, visible: false },
  ])("$name", async ({ viewerId, visible }) => {
    const games = new InMemoryGameRepository([game("g1", "u1")]);
    const detail = await new GetGameWithLogs(
      games,
      new InMemoryGameLogRepository(),
      new InMemoryAnalysisJobRepository(),
    ).execute("g1", viewerId);
    if (visible) expect(detail?.game.id).toBe("g1");
    else expect(detail).toBeNull();
  });
});
