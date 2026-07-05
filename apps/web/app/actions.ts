"use server";

import { type KifuMetaInput, type KifuStatus } from "@rigel/client";
import { type Kifu, type Rules, type Seat } from "@rigel/schema";
import {
  analyze,
  createCheckout,
  createPortal,
  createEmptyKifu,
  createGame,
  deleteAccount,
  deleteGame,
  deleteKifu,
  getMyGames,
  setGameVisibility,
  updateGame,
  updateGameRules,
  updateKifu,
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

export async function updateKifuAction(logId: string, kifu: Kifu, status?: KifuStatus) {
  return updateKifu(await requireToken(), logId, kifu, status);
}

/** 半荘の公開範囲を変更（配下の全局に反映）。公開/非公開は半荘単位で決める。 */
export async function setGameVisibilityAction(gameId: string, visibility: "public" | "private") {
  return setGameVisibility(await requireToken(), gameId, visibility);
}

/** 半荘のルールを変更（配下の全局に反映）。ルールは局ごとに持たず半荘で共有する。 */
export async function updateGameRulesAction(gameId: string, rules: Rules) {
  return updateGameRules(await requireToken(), gameId, rules);
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
) {
  return createEmptyKifu(await requireToken(), gameId, cameraBottomSeat, meta);
}

export async function createGameAction(cameraBottomSeat: Seat, meta?: KifuMetaInput) {
  return createGame(await requireToken(), cameraBottomSeat, meta);
}

export async function analyzeAction(form: FormData) {
  return analyze(await requireToken(), form);
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
