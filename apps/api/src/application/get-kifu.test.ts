import { describe, expect, it } from "vitest";
import type { GameLog, Visibility } from "../domain/kifu/game-log";
import { InMemoryGameLogRepository } from "../test-support/in-memory";
import { validKifu } from "../test-support/kifu";
import { GetKifu } from "./get-kifu.usecase";

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

describe("GetKifu（可視性は application で判定する）", () => {
  it.each<{ name: string; visibility: Visibility; viewerId: string | null; visible: boolean }>([
    {
      name: "public は所有者本人が取得できる",
      visibility: "public",
      viewerId: OWNER,
      visible: true,
    },
    { name: "public は他人も取得できる", visibility: "public", viewerId: "other", visible: true },
    {
      name: "public は未ログインも取得できる",
      visibility: "public",
      viewerId: null,
      visible: true,
    },
    {
      name: "private は所有者本人が取得できる",
      visibility: "private",
      viewerId: OWNER,
      visible: true,
    },
    {
      name: "private は他人には null（存在を漏らさない）",
      visibility: "private",
      viewerId: "other",
      visible: false,
    },
    {
      name: "private は未ログインには null（存在を漏らさない）",
      visibility: "private",
      viewerId: null,
      visible: false,
    },
  ])("$name", async ({ visibility, viewerId, visible }) => {
    const gameLogs = new InMemoryGameLogRepository();
    await gameLogs.save(log("l1", visibility));
    const result = await new GetKifu(gameLogs).execute("l1", viewerId);
    if (visible) expect(result?.id).toBe("l1");
    else expect(result).toBeNull();
  });

  it("存在しない局は null（見えない局と区別しない）", async () => {
    const result = await new GetKifu(new InMemoryGameLogRepository()).execute("nope", OWNER);
    expect(result).toBeNull();
  });
});
