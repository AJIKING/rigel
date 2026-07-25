import { describe, expect, it } from "vitest";
import type { GameLog, Visibility } from "../domain/kifu/game-log";
import { InMemoryGameLogRepository } from "../test-support/in-memory";
import { validKifu } from "../test-support/kifu";
import { ListKifu } from "./list-kifu.usecase";

const NOW = new Date("2026-07-25T00:00:00.000Z");
const OWNER = "owner-1";
const log = (id: string, visibility: Visibility): GameLog => ({
  id,
  userId: OWNER,
  gameId: "g1",
  seq: 1,
  kifu: validKifu,
  visibility,
  status: "complete",
  createdAt: NOW,
});

describe("ListKifu（viewer に見える局だけ返す）", () => {
  const seed = async () => {
    const gameLogs = new InMemoryGameLogRepository();
    await gameLogs.save(log("pub", "public"));
    await gameLogs.save(log("priv", "private"));
    return gameLogs;
  };

  it.each<{ name: string; viewerId: string | null; expected: string[] }>([
    {
      name: "所有者本人には public も private も見える",
      viewerId: OWNER,
      expected: ["pub", "priv"],
    },
    { name: "他人には public だけ見える", viewerId: "other", expected: ["pub"] },
    { name: "未ログインには public だけ見える", viewerId: null, expected: ["pub"] },
  ])("$name", async ({ viewerId, expected }) => {
    const result = await new ListKifu(await seed()).execute(OWNER, viewerId);
    expect(result.map((l) => l.id)).toEqual(expected);
  });
});
