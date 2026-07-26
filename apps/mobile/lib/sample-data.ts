import { KifuSchema, type Kifu } from "@rigel/schema";
import type { Game, GameDetail, GameLog, MyGameCard, PublicGameCard } from "./api";

export const SAMPLE_GAME_ID = "sample";

const sampleKifu: Kifu = KifuSchema.parse({
  schemaVersion: "1.0.0",
  capturedAt: "2026-06-28T12:00:00.000Z",
  result: "ron",
  cameraBottomSeat: "east",
  seats: {
    east: {
      hand: [{ tile: "1m" }, { tile: "2m" }, { tile: "3m" }],
      river: [
        { order: 1, tile: "9p", riichi: false },
        { order: 2, tile: "1z", riichi: true },
        { order: 3, tile: null, riichi: false },
      ],
    },
    south: { river: [{ order: 1, tile: "3s", riichi: false }] },
    west: { river: [{ order: 1, tile: "0p", riichi: false }] },
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
    visibility: "public",
    status: "complete",
    createdAt: "2026-06-28T12:00:00.000Z",
  },
  {
    id: "sample-e2",
    userId: "demo",
    gameId: SAMPLE_GAME_ID,
    seq: 2,
    kifu: sampleKifu,
    visibility: "public",
    status: "complete",
    createdAt: "2026-06-28T12:12:00.000Z",
  },
];

export const sampleGameDetail: GameDetail = {
  game: sampleGames[0],
  logs: sampleLogs,
  favoriteCount: 0,
  viewerFaved: false,
};

/** マイ牌譜フィードのサンプル（未ログイン時の表示用）。 */
export const sampleMyGames: MyGameCard[] = [
  {
    id: SAMPLE_GAME_ID,
    title: "東風戦 東一局 リーチ一発ツモ",
    createdAt: "2026-06-28T12:00:00.000Z",
    kyokuCount: 8,
    publicCount: 8,
    draftCount: 0,
    favoriteCount: 0,
    viewerFaved: false,
  },
  {
    id: "sample-2",
    title: "佐藤さんの倍満放銃、痛恨の一局",
    createdAt: "2026-06-27T21:00:00.000Z",
    kyokuCount: 12,
    publicCount: 0,
    draftCount: 3,
    favoriteCount: 0,
    viewerFaved: false,
  },
  {
    id: "sample-3",
    title: "半荘 南四局 逆転の三倍満",
    createdAt: "2026-06-20T10:00:00.000Z",
    kyokuCount: 16,
    publicCount: 16,
    draftCount: 0,
    favoriteCount: 0,
    viewerFaved: false,
  },
];

/** 公開牌譜フィードのサンプル（未ログイン時の表示用）。 */
export const samplePublicGames: PublicGameCard[] = [
  {
    id: SAMPLE_GAME_ID,
    ownerId: "demo",
    ownerHandle: "kuro",
    ownerName: "kuro",
    title: "東風戦 東一局 リーチ一発ツモ",
    createdAt: "2026-06-28T12:00:00.000Z",
    kyokuCount: 8,
    firstLogId: "sample-e1",
    favoriteCount: 12,
    viewerFaved: false,
  },
  {
    id: "sample-p2",
    ownerId: "nodoka",
    ownerHandle: "nodoka",
    ownerName: "nodoka",
    title: "国士無双、一生に一度の配牌",
    createdAt: "2026-06-28T11:00:00.000Z",
    kyokuCount: 4,
    firstLogId: "sample-p2-e1",
    favoriteCount: 47,
    viewerFaved: false,
  },
  {
    id: "sample-p3",
    ownerId: "tsuru",
    ownerHandle: null,
    ownerName: null,
    title: "半荘 南四局 逆転の三倍満",
    createdAt: "2026-06-26T09:00:00.000Z",
    kyokuCount: 16,
    firstLogId: "sample-p3-e1",
    favoriteCount: 3,
    viewerFaved: false,
  },
];
