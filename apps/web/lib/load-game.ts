import "server-only";
import { KifuSchema } from "@rigel/schema";
import { type GameDetail } from "./api";
import { getGame } from "./api-server";

/** 所有者の半荘詳細をサーバ取得し、旧牌譜を KifuSchema で正規化して返す。
 *  取得失敗・権限なしは null。Server Component と reload 用 Server Action の共通経路。 */
export async function loadGameDetail(token: string, gameId: string): Promise<GameDetail | null> {
  const raw = await getGame(token, gameId).catch(() => null);
  if (!raw) return null;
  return { ...raw, logs: raw.logs.map((l) => ({ ...l, kifu: KifuSchema.parse(l.kifu) })) };
}
