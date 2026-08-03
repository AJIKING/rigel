// mobile → api（Workers）クライアント。実体は共有の @rigel/client。
// ベースURLは EXPO_PUBLIC_API_URL。

import { createApiClient } from "@rigel/client";

export type {
  AnalyzeResult,
  AuthResult,
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
  PublicProfile,
  QuizSessionDto,
} from "@rigel/client";

/** api のベースURL（元写真の Image 直接取得など、クライアント外で URL を組むときに使う）。 */
export const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL ?? "";

const client = createApiClient(API_BASE_URL);

export const {
  authWithGoogle,
  authWithApple,
  authWithReviewCode,
  getAnalysisJob,
  getProblemAnalysisJob,
  getProblemDraft,
  deleteProblemDraft,
  listProblemDrafts,
  listProblemPhotos,
  retryAnalysis,
  listGamePhotos,
  fetchMe,
  getMyGames,
  getPublicGames,
  getPublicGameDetail,
  getGame,
  analyze,
  analyzeProblem,
  createPortal,
  createGame,
  createEmptyKifu,
  updateKifu,
  deleteKifu,
  deleteGame,
  updateGame,
  updateGameRules,
  updateGamePlayers,
  setGameStatus,
  setGameVisibility,
  updateProfile,
  getPublicProfile,
  deleteAccount,
  getPublicProblems,
  getMyProblems,
  getProblem,
  createProblem,
  updateProblem,
  deleteProblem,
  answerProblem,
  getProblemStats,
  startQuizSession,
  finishQuizSession,
  listQuizSessions,
  setFavorite,
  listMyFavorites,
} = client;
