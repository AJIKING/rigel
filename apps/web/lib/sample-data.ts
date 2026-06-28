import type { Game, GameDetail, GameLog } from "./api";
import { sampleKifu } from "./sample-kifu";

// 未ログイン/ローカル確認用のサンプル半荘。実データは API（ログイン）から取得する。
export const SAMPLE_GAME_ID = "sample";

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
    createdAt: "2026-06-28T12:00:00.000Z",
  },
  {
    id: "sample-e2",
    userId: "demo",
    gameId: SAMPLE_GAME_ID,
    seq: 2,
    kifu: sampleKifu,
    visibility: "public",
    createdAt: "2026-06-28T12:12:00.000Z",
  },
];

export const sampleGameDetail: GameDetail = { game: sampleGames[0], logs: sampleLogs };
