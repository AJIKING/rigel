import type { AiRiverResponse, CameraSeat, Tile } from "@rigel/schema";
import { describe, expect, it } from "vitest";
import { assembleKifu } from "./assemble";

function river(tile: Tile): AiRiverResponse {
  return {
    discards: [{ order: 1, tile, riichi: false, tsumogiri: false, confidence: 1 }],
    notes: "",
  };
}

const rivers: Record<CameraSeat, AiRiverResponse> = {
  bottom: river("1m"),
  right: river("2p"),
  top: river("3s"),
  left: river("4z"),
};

describe("assembleKifu", () => {
  it("bottom の河は撮影時の手前席に入る（回転方向に依存しない不変条件）", () => {
    const kifu = assembleKifu({
      rivers,
      cameraBottomSeat: "east",
      capturedAt: "2026-06-28T00:00:00.000Z",
    });
    expect(kifu.seats.east.river[0]?.tile).toBe("1m");
  });

  it("4方向の河は4つの異なる席に入り、全体が KifuSchema を満たす", () => {
    const kifu = assembleKifu({
      rivers,
      cameraBottomSeat: "south",
      capturedAt: "2026-06-28T00:00:00.000Z",
    });
    const tiles = [
      kifu.seats.east.river[0]?.tile,
      kifu.seats.south.river[0]?.tile,
      kifu.seats.west.river[0]?.tile,
      kifu.seats.north.river[0]?.tile,
    ];
    expect(new Set(tiles)).toEqual(new Set(["1m", "2p", "3s", "4z"]));
    expect(kifu.schemaVersion).toBe("1.0.0");
    expect(kifu.cameraBottomSeat).toBe("south");
  });

  it("AI の notes を readingNotes に引き継ぐ（人手修正の手がかりを捨てない）", () => {
    // グレア・ブレ・見切れの申告は「どこを直せばよいか」の情報。捨てると
    // 「人が直しやすい」という指標に直接効く手がかりが失われる。
    const kifu = assembleKifu({
      rivers: {
        ...rivers,
        bottom: { ...river("1m"), notes: "glare on the left" },
        top: { ...river("3s"), notes: "blurred" },
      },
      hands: {
        bottom: { hand: [{ tile: "1m", confidence: 0.9 }], melds: [], notes: "occluded" },
      },
      cameraBottomSeat: "east",
      capturedAt: "2026-06-28T00:00:00.000Z",
    });

    // どの方向の申告かが分かる形で連結する（空の notes は含めない）。
    expect(kifu.readingNotes).toContain("glare on the left");
    expect(kifu.readingNotes).toContain("blurred");
    expect(kifu.readingNotes).toContain("occluded");
    expect(kifu.readingNotes).toContain("bottom");
  });

  it("notes が全て空なら readingNotes も空（余計な文字列を足さない）", () => {
    const kifu = assembleKifu({
      rivers,
      cameraBottomSeat: "east",
      capturedAt: "2026-06-28T00:00:00.000Z",
    });
    expect(kifu.readingNotes).toBe("");
  });
});
