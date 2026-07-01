"use server";

import { type KifuMetaInput } from "@rigel/client";
import { type Kifu, type Seat } from "@rigel/schema";
import {
  analyze,
  createCheckout,
  createEmptyKifu,
  createGame,
  deleteAccount,
  deleteKifu,
  getMyGames,
  setVisibility,
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

export async function updateKifuAction(logId: string, kifu: Kifu) {
  return updateKifu(await requireToken(), logId, kifu);
}

export async function setVisibilityAction(logId: string, visibility: "public" | "private") {
  return setVisibility(await requireToken(), logId, visibility);
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

export async function updateProfileAction(update: {
  handle?: string;
  displayName?: string;
  profilePublic?: boolean;
}) {
  return updateProfile(await requireToken(), update);
}

export async function createCheckoutAction(params: {
  plan: "next" | "pro";
  successUrl: string;
  cancelUrl: string;
}) {
  return createCheckout(await requireToken(), params);
}

export async function deleteAccountAction() {
  const res = await deleteAccount(await requireToken());
  if (res.ok) await clearSessionCookie();
  return res;
}
