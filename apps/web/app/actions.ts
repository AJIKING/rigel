"use server";

import {
  type FavoriteTargetType,
  type KifuMetaInput,
  type KifuStatus,
  type ProblemStatus,
} from "@rigel/client";
// KifuStatus は setGameStatusAction（半荘単位の下書き/編集済）で使う。
import {
  type Kifu,
  type Players,
  type Problem,
  type ProblemAction,
  type QuizKind,
  type QuizResult,
  type Rules,
  type Seat,
} from "@rigel/schema";
import {
  analyze,
  analyzeProblem,
  answerProblem,
  createCheckout,
  getAnalysisJob,
  getProblemAnalysisJob,
  retryAnalysis,
  listGamePhotos,
  finishQuizSession,
  listMyFavorites,
  listQuizSessions,
  setFavorite,
  startQuizSession,
  createPortal,
  createEmptyKifu,
  createGame,
  createProblem,
  deleteAccount,
  deleteGame,
  deleteKifu,
  deleteProblem,
  getMyGames,
  getMyProblems,
  getProblemStats,
  setGameStatus,
  setGameVisibility,
  updateGame,
  updateGamePlayers,
  updateGameRules,
  updateKifu,
  updateProblem,
  updateProfile,
} from "../lib/api-server";
import { loadGameDetail } from "../lib/load-game";
import { clearSessionCookie, getSessionToken } from "../lib/session";

// 認証が要る書き込みは Server Action で行う。トークンは Cookie から読み、クライアントには
// 渡さない（HttpOnly を維持）。api・モバイルは無変更（Bearer のまま）。

async function requireToken(): Promise<string> {
  const token = await getSessionToken();
  if (!token) throw new Error("unauthorized");
  return token;
}

/** エディタの reload 用: 現在のセッションで半荘詳細を取り直す。 */
export async function getGameAction(gameId: string) {
  return loadGameDetail(await requireToken(), gameId);
}

/** マイページの牌譜一覧（要ログイン）。 */
export async function getMyGamesAction() {
  return getMyGames(await requireToken());
}

export async function updateKifuAction(logId: string, kifu: Kifu, seq?: number) {
  return updateKifu(await requireToken(), logId, kifu, seq);
}

/** 半荘の編集状態（下書き/編集済）を変更（配下の全局に反映）。半荘単位で決める。 */
export async function setGameStatusAction(gameId: string, status: KifuStatus) {
  return setGameStatus(await requireToken(), gameId, status);
}

/** 半荘の公開範囲を変更（配下の全局に反映）。公開/非公開は半荘単位で決める。 */
export async function setGameVisibilityAction(gameId: string, visibility: "public" | "private") {
  return setGameVisibility(await requireToken(), gameId, visibility);
}

/** 半荘のルールを変更（配下の全局に反映）。ルールは局ごとに持たず半荘で共有する。 */
export async function updateGameRulesAction(gameId: string, rules: Rules) {
  return updateGameRules(await requireToken(), gameId, rules);
}

/** 半荘の選手情報（選手名・リーグ戦ポイント）を変更（配下の全局に反映）。半荘単位。 */
export async function updateGamePlayersAction(gameId: string, players: Players | null) {
  return updateGamePlayers(await requireToken(), gameId, players);
}

/** 半荘名を変更する（所有者のみ）。 */
export async function updateGameAction(gameId: string, input: { title: string }) {
  return updateGame(await requireToken(), gameId, input);
}

/** 半荘を配下の全局ごと削除する（所有者のみ）。 */
export async function deleteGameAction(gameId: string) {
  return deleteGame(await requireToken(), gameId);
}

export async function deleteKifuAction(logId: string) {
  return deleteKifu(await requireToken(), logId);
}

export async function createEmptyKifuAction(
  gameId: string,
  cameraBottomSeat: Seat,
  meta?: KifuMetaInput,
  seq?: number,
) {
  return createEmptyKifu(await requireToken(), gameId, cameraBottomSeat, meta, seq);
}

export async function createGameAction(cameraBottomSeat: Seat, meta?: KifuMetaInput, seq?: number) {
  return createGame(await requireToken(), cameraBottomSeat, meta, seq);
}

export async function analyzeAction(form: FormData) {
  return analyze(await requireToken(), form);
}

/** 解析ジョブの状態（ポーリング用。docs/plans/async-analysis.md）。 */
export async function getAnalysisJobAction(jobId: string) {
  return getAnalysisJob(await requireToken(), jobId);
}

/** もう一度解析（Phase 2）。失敗ジョブを再アップロード無しで再実行する。 */
export async function retryAnalysisAction(jobId: string) {
  return retryAnalysis(await requireToken(), jobId);
}

/** 半荘の元写真の一覧（恒久保存・所有者のみ。バイトは /api/photos の BFF プロキシで取る）。 */
export async function getGamePhotosAction(gameId: string) {
  return listGamePhotos(await requireToken(), gameId);
}

/** 何切るの写真AI再現（非同期ジョブ。202 + jobId → ポーリング。保存なし）。 */
export async function analyzeProblemAction(form: FormData) {
  return analyzeProblem(await requireToken(), form);
}

/** 何切る解析ジョブの状態（ポーリング用。done で結果ドラフト同梱）。 */
export async function getProblemAnalysisJobAction(jobId: string) {
  return getProblemAnalysisJob(await requireToken(), jobId);
}

export async function updateProfileAction(update: { handle?: string; displayName?: string }) {
  return updateProfile(await requireToken(), update);
}

export async function createCheckoutAction(params: {
  plan: "next" | "pro";
  successUrl: string;
  cancelUrl: string;
}) {
  return createCheckout(await requireToken(), params);
}

/** 決済ポータル（プラン変更・解約）。加入中ユーザー専用。 */
export async function createPortalAction(params: { returnUrl: string }) {
  return createPortal(await requireToken(), params);
}

export async function deleteAccountAction() {
  const res = await deleteAccount(await requireToken());
  if (res.ok) await clearSessionCookie();
  return res;
}

// ------------------------------------------------------------
// 何切る問題（作成・更新・削除・マイ一覧・回答・分布）。すべて要ログイン。
// ------------------------------------------------------------

/** マイ何切る一覧（draft 含む）。 */
export async function getMyProblemsAction() {
  return getMyProblems(await requireToken());
}

export async function createProblemAction(input: {
  title: string;
  problem: Problem;
  status?: ProblemStatus;
}) {
  return createProblem(await requireToken(), input);
}

export async function updateProblemAction(
  problemId: string,
  input: { title?: string; problem?: Problem; status?: ProblemStatus },
) {
  return updateProblem(await requireToken(), problemId, input);
}

export async function deleteProblemAction(problemId: string) {
  return deleteProblem(await requireToken(), problemId);
}

/** 回答（1人1回・再回答は上書き）。分布は getProblemStatsAction で別途取る。 */
export async function answerProblemAction(problemId: string, action: ProblemAction) {
  return answerProblem(await requireToken(), problemId, action);
}

/** 回答分布＋自分の回答（要ログイン）。 */
export async function getProblemStatsAction(problemId: string) {
  return getProblemStats(await requireToken(), problemId);
}

// ------------------------------------------------------------
// 特訓クイズ（60秒タイムアタック）。要ログイン。
// ------------------------------------------------------------

/** 特訓クイズを開始する（無料は1日3回・開始時に1回消費をサーバ強制。超過は status 402）。 */
export async function startQuizSessionAction(kind: QuizKind) {
  return startQuizSession(await requireToken(), kind);
}

/** 60秒セッションの結果（クライアント採点）を記録する。 */
export async function finishQuizSessionAction(sessionId: string, result: QuizResult) {
  return finishQuizSession(await requireToken(), sessionId, result);
}

/** 自分の完了済みセッション履歴（新しい順）。開始ダイアログの直近記録などで使う。 */
export async function listQuizSessionsAction(since?: string) {
  return listQuizSessions(await requireToken(), since);
}

// ------------------------------------------------------------
// お気に入り（★）。サーバー保存（[決定] 2026-07-26）。要ログイン。
// ------------------------------------------------------------

/** お気に入りを付ける/外す（冪等）。自分に見えない対象は ok:false（status 404）。 */
export async function setFavoriteAction(
  targetType: FavoriteTargetType,
  targetId: string,
  faved: boolean,
) {
  return setFavorite(await requireToken(), targetType, targetId, faved);
}

/** 自分のお気に入り一覧（半荘・何切る。付けた新しい順）。 */
export async function getMyFavoritesAction() {
  return listMyFavorites(await requireToken());
}
