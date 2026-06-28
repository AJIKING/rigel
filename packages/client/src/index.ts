// ============================================================
// @rigel/client — api(Workers) を叩く薄いクライアント（web/mobile 共有）
// ------------------------------------------------------------
// baseUrl だけ差し替えれば web(Next) / mobile(Expo) どちらからも使える。
// fetch は注入可能（テスト用）。型(DTO)もここに集約して両アプリの drift を防ぐ。
// ============================================================

import type { Kifu } from "@rigel/schema";

export interface AuthUser {
  id: string;
  plan: "free" | "paid";
}

export interface AuthResult {
  sessionToken: string;
  user: AuthUser;
}

export interface Game {
  id: string;
  userId: string;
  title: string;
  createdAt: string;
}

export interface GameLog {
  id: string;
  userId: string;
  gameId: string | null;
  seq: number;
  kifu: Kifu;
  createdAt: string;
}

export interface GameDetail {
  game: Game;
  logs: GameLog[];
}

export interface ApiClient {
  /** Google ID トークンでログインし、セッショントークンとユーザーを得る。 */
  authWithGoogle(idToken: string): Promise<AuthResult>;
  /** セッショントークンで自分のユーザー情報を取得。無効なら null。 */
  fetchMe(token: string): Promise<AuthUser | null>;
  /** ログインユーザーの半荘一覧。 */
  getGames(token: string): Promise<Game[]>;
  /** 半荘詳細（半荘 + 局一覧）。見つからなければ null。 */
  getGame(token: string, id: string): Promise<GameDetail | null>;
}

/**
 * baseUrl（+ 任意の fetch 実装）から ApiClient を作る。
 * fetchImpl 未指定時はグローバル fetch を **呼び出し時に** 解決する
 * （テストでの差し替えやアプリ側の global を尊重するため）。
 */
export function createApiClient(baseUrl: string, fetchImpl?: typeof fetch): ApiClient {
  const bearer = (token: string): HeadersInit => ({ authorization: `Bearer ${token}` });
  const doFetch: typeof fetch = (input, init) => (fetchImpl ?? fetch)(input, init);

  return {
    async authWithGoogle(idToken) {
      const res = await doFetch(`${baseUrl}/auth/google`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ idToken }),
      });
      if (!res.ok) throw new Error(`auth failed: ${res.status}`);
      return res.json() as Promise<AuthResult>;
    },

    async fetchMe(token) {
      const res = await doFetch(`${baseUrl}/me`, { headers: bearer(token) });
      if (!res.ok) return null;
      return res.json() as Promise<AuthUser>;
    },

    async getGames(token) {
      const res = await doFetch(`${baseUrl}/games`, { headers: bearer(token) });
      if (!res.ok) throw new Error(`games failed: ${res.status}`);
      return res.json() as Promise<Game[]>;
    },

    async getGame(token, id) {
      const res = await doFetch(`${baseUrl}/games/${id}`, { headers: bearer(token) });
      if (res.status === 404) return null;
      if (!res.ok) throw new Error(`game failed: ${res.status}`);
      return res.json() as Promise<GameDetail>;
    },
  };
}
