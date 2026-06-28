import { KifuSchema, type Kifu } from "@rigel/schema";

// 画面確認用のサンプル牌譜（confidence 低めの牌を混ぜてハイライトを見せる）。
export const sampleKifu: Kifu = KifuSchema.parse({
  schemaVersion: "1.0.0",
  capturedAt: "2026-06-28T12:00:00.000Z",
  result: "ron",
  cameraBottomSeat: "east",
  seats: {
    east: {
      hand: [
        { tile: "1m", confidence: 0.98 },
        { tile: "2m", confidence: 0.95 },
        { tile: "3m", confidence: 0.4 },
      ],
      melds: [
        {
          type: "pon",
          tiles: [
            { tile: "5z", confidence: 0.9 },
            { tile: "5z", confidence: 0.88 },
            { tile: "5z", confidence: 0.91 },
          ],
          from: "west",
        },
      ],
      river: [
        { order: 1, tile: "9p", riichi: false, confidence: 0.97 },
        { order: 2, tile: "1z", riichi: true, confidence: 0.9 },
        { order: 3, tile: null, riichi: false, confidence: 0 },
      ],
    },
    south: { river: [{ order: 1, tile: "3s", riichi: false, confidence: 0.92 }] },
    west: { river: [{ order: 1, tile: "0p", riichi: false, confidence: 0.88 }] },
    north: { river: [] },
  },
});
