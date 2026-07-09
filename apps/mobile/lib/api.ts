// mobile → api（Workers）クライアント。実体は共有の @rigel/client。
// ベースURLは EXPO_PUBLIC_API_URL。

import { createApiClient } from "@rigel/client";

export type {
  AnalyzeResult,
  AuthUser,
  Game,
  GameDetail,
  GameLog,
  MyGameCard,
  PublicGameCard,
  PublicGameDetail,
  PaidPlan,
  Plan,
  ProblemPost,
  ProblemStats,
  ProblemStatus,
} from "@rigel/client";

const client = createApiClient(process.env.EXPO_PUBLIC_API_URL ?? "");

export const {
  authWithGoogle,
  fetchMe,
  getMyGames,
  getPublicGames,
  getPublicGameDetail,
  getGame,
  analyze,
  createPortal,
  createGame,
  createEmptyKifu,
  updateKifu,
  deleteKifu,
  deleteGame,
  updateGame,
  updateGameRules,
  setGameStatus,
  setGameVisibility,
  updateProfile,
  deleteAccount,
  getPublicProblems,
  getMyProblems,
  getProblem,
  createProblem,
  updateProblem,
  deleteProblem,
  answerProblem,
  getProblemStats,
} = client;
