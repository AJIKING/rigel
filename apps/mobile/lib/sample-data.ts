import { KifuSchema, type Kifu } from "@rigel/schema";
import type { Game, GameDetail, GameLog } from "./api";

export const SAMPLE_GAME_ID = "sample";

const sampleKifu: Kifu = KifuSchema.parse({
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

export const sampleGames: Game[] = [
  {
    id: SAMPLE_GAME_ID,
    userId: "demo",
    title: "サンプル半荘（6/28 友人戦）",
    createdAt: "2026-06-28T12:00:00.000Z",
  },
];

const sampleLogs: GameLog[] = [
  {
    id: "sample-e1",
    userId: "demo",
    gameId: SAMPLE_GAME_ID,
    seq: 1,
    kifu: sampleKifu,
    createdAt: "2026-06-28T12:00:00.000Z",
  },
  {
    id: "sample-e2",
    userId: "demo",
    gameId: SAMPLE_GAME_ID,
    seq: 2,
    kifu: sampleKifu,
    createdAt: "2026-06-28T12:12:00.000Z",
  },
];

export const sampleGameDetail: GameDetail = { game: sampleGames[0], logs: sampleLogs };
