import "server-only";
import { KifuSchema } from "@rigel/schema";
import { type GameDetail, type GameLog } from "./api";
import { getGame } from "./api-server";

/** 旧牌譜（rules/agari/meta の新フィールドが無い）に既定を埋めて正規化する。
 *  半荘詳細（所有者用/公開用）を画面に渡す前の共通経路。 */
export function normalizeDetailLogs<T extends { logs: GameLog[] }>(detail: T): T {
  return { ...detail, logs: detail.logs.map((l) => ({ ...l, kifu: KifuSchema.parse(l.kifu) })) };
}

/** 所有者の半荘詳細をサーバ取得し、旧牌譜を KifuSchema で正規化して返す。
 *  取得失敗・権限なしは null。Server Component と reload 用 Server Action の共通経路。 */
export async function loadGameDetail(token: string, gameId: string): Promise<GameDetail | null> {
  const raw = await getGame(token, gameId).catch(() => null);
  if (!raw) return null;
  return normalizeDetailLogs(raw);
}
