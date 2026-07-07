import { KifuSchema } from "@rigel/schema";
import { describe, expect, it } from "vitest";
import { type AuthUser, type GameDetail } from "./api";
import { toViewerDetail } from "./view-detail";

function makeOwn(): GameDetail {
  return {
    game: { id: "g1", userId: "u1", title: "非公開テスト卓", createdAt: "2026-07-01T00:00:00Z" },
    logs: [
      {
        id: "l1",
        userId: "u1",
        gameId: "g1",
        seq: 1,
        kifu: KifuSchema.parse({
          schemaVersion: "1.0.0",
          capturedAt: "2026-07-01T00:00:00.000Z",
          seats: { east: {}, south: {}, west: {}, north: {} },
        }),
        visibility: "private",
        status: "complete",
        createdAt: "2026-07-01T00:00:00Z",
      },
    ],
  };
}

describe("toViewerDetail（所有者の半荘 → ビューア形式）", () => {
  it("game/logs を写し、owner は自分のプロフィールから組む", () => {
    const me: AuthUser = { id: "u1", plan: "free", handle: "taro", displayName: "太郎" };
    const d = toViewerDetail(makeOwn(), me);
    expect(d.game).toEqual({
      id: "g1",
      title: "非公開テスト卓",
      createdAt: "2026-07-01T00:00:00Z",
    });
    expect(d.owner).toEqual({ id: "u1", handle: "taro", displayName: "太郎" });
    expect(d.logs).toHaveLength(1);
    expect(d.logs[0]?.visibility).toBe("private"); // 非公開のまま（ビューアの出し分けに使う）
  });

  it("プロフィール取得に失敗しても半荘の userId で成立する", () => {
    const d = toViewerDetail(makeOwn(), null);
    expect(d.owner).toEqual({ id: "u1", handle: null, displayName: "" });
  });
});
