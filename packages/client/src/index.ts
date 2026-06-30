// ============================================================
// @rigel/client — api(Workers) を叩く薄いクライアント（web/mobile 共有）
// ------------------------------------------------------------
// baseUrl だけ差し替えれば web(Next) / mobile(Expo) どちらからも使える。
// fetch は注入可能（テスト用）。型(DTO)もここに集約して両アプリの drift を防ぐ。
// ============================================================

import type { Kifu, Seat } from "@rigel/schema";

/** 作成時に渡せる局メタ（本場/供託/ドラ/最終巡目）。記録のみ・点数計算はしない。 */
export type KifuMetaInput = Partial<Pick<Kifu["meta"], "honba" | "kyotaku" | "dora" | "junme">>;

export type Plan = "free" | "next" | "pro";
export type PaidPlan = "next" | "pro";
export type Visibility = "public" | "private";

export interface AuthUser {
  id: string;
  plan: Plan;
  /** 公開ハンドル(@xxx)。未設定は null。 */
  handle?: string | null;
  /** 表示名。 */
  displayName?: string;
  /** プロフィール公開フラグ。 */
  profilePublic?: boolean;
  /** 当月の Gemini 呼び出し上限（/me のみ。auth レスポンスには無い場合あり）。 */
  monthlyCallQuota?: number;
  /** 当月の残り呼び出し回数。 */
  remainingCalls?: number;
}

/** 別ユーザーの公開プロフィール（+ 公開半荘）。 */
export interface PublicProfile {
  id: string;
  handle: string | null;
  displayName: string;
  games: PublicGameCard[];
}

/** 読み取り専用ビューア用の公開半荘（公開局＋所有者表示）。 */
export interface PublicGameDetail {
  game: { id: string; title: string; createdAt: string };
  owner: { id: string; handle: string | null; displayName: string };
  logs: GameLog[];
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
  visibility: Visibility;
  createdAt: string;
}

export interface GameDetail {
  game: Game;
  logs: GameLog[];
}

/** マイページの半荘カード（局数・公開数つき）。 */
export interface MyGameCard {
  id: string;
  title: string;
  createdAt: string;
  kyokuCount: number;
  publicCount: number;
}

/** 公開牌譜フィードの半荘カード。 */
export interface PublicGameCard {
  id: string;
  ownerId: string;
  title: string;
  createdAt: string;
  kyokuCount: number;
  /** 最新の公開局ID（読み取り表示先 /k/[logId]）。 */
  firstLogId: string;
}

export type AnalyzeResult =
  { ok: true; gameId: string; logId: string } | { ok: false; status: number; reason?: string };

export type CheckoutResult = { ok: true; url: string } | { ok: false; status: number };

export interface ApiClient {
  /** Google ID トークンでログインし、セッショントークンとユーザーを得る。 */
  authWithGoogle(idToken: string): Promise<AuthResult>;
  /** セッショントークンで自分のユーザー情報を取得。無効なら null。 */
  fetchMe(token: string): Promise<AuthUser | null>;
  /** ログインユーザーの半荘一覧。 */
  getGames(token: string): Promise<Game[]>;
  /** マイページ用: 自分の半荘＋局数/公開数。 */
  getMyGames(token: string): Promise<MyGameCard[]>;
  /** 公開牌譜フィード（全ユーザーの公開半荘・新着順）。認証不要。 */
  getPublicGames(): Promise<PublicGameCard[]>;
  /** 半荘詳細（半荘 + 局一覧）。見つからなければ null。 */
  getGame(token: string, id: string): Promise<GameDetail | null>;
  /** 牌譜1件の取得（公開は誰でも・非公開は所有者のみ）。見つからなければ null。 */
  getKifu(logId: string, token?: string): Promise<GameLog | null>;
  /** 公開半荘の取得（読み取り専用ビューア用・認証不要）。見つからなければ null。 */
  getPublicGameDetail(gameId: string): Promise<PublicGameDetail | null>;
  /**
   * 撮影画像(multipart FormData)を解析し、半荘に局として保存する。
   * FormData は各プラットフォームで組む（web=File / RN={uri,name,type}）。
   * 必要フィールド: river, cameraBottomSeat（任意: hand_*, gameId）。
   */
  analyze(token: string, form: FormData): Promise<AnalyzeResult>;
  /** 牌譜の修正を保存する（所有者のみ）。成否を返す。 */
  updateKifu(token: string, logId: string, kifu: Kifu): Promise<{ ok: boolean; status: number }>;
  /**
   * 指定プラン(next/pro)へのアップグレード Checkout を開始し、決済ページURLを得る。
   * urls は決済後/中断後の戻り先（各アプリが自分のオリジンで組む）。
   * 課金未設定(501)や失敗時は ok:false（status 付き）。
   */
  createCheckout(
    token: string,
    params: { plan: PaidPlan; successUrl: string; cancelUrl: string },
  ): Promise<CheckoutResult>;
  /** 牌譜の公開範囲を切り替える（所有者のみ）。成否を返す。 */
  setVisibility(
    token: string,
    logId: string,
    visibility: Visibility,
  ): Promise<{ ok: boolean; status: number }>;
  /** 牌譜（局）を削除する（所有者のみ）。成否を返す。 */
  deleteKifu(token: string, logId: string): Promise<{ ok: boolean; status: number }>;
  /** 新しい半荘を「空の初局」つきで作る（手動入力の起点）。成功で gameId/logId を返す。 */
  createGame(
    token: string,
    cameraBottomSeat: Seat,
    meta?: KifuMetaInput,
  ): Promise<{ ok: true; gameId: string; logId: string } | { ok: false; status: number }>;
  /** 半荘に空の局を追加する（手動入力の起点）。成功で gameId/新しい logId を返す。 */
  createEmptyKifu(
    token: string,
    gameId: string,
    cameraBottomSeat: Seat,
    meta?: KifuMetaInput,
  ): Promise<{ ok: true; gameId: string; logId: string } | { ok: false; status: number }>;
  /** プロフィール（handle/表示名/公開）を更新する。handle 重複は status 409。 */
  updateProfile(
    token: string,
    update: { handle?: string; displayName?: string; profilePublic?: boolean },
  ): Promise<{ ok: boolean; status: number }>;
  /** 別ユーザーの公開プロフィール（handle か id）。見つからなければ null。認証不要。 */
  getPublicProfile(idOrHandle: string): Promise<PublicProfile | null>;
  /** 自分のアカウントを削除する（取り消し不可）。 */
  deleteAccount(token: string): Promise<{ ok: boolean; status: number }>;
}

/**
 * baseUrl（+ 任意の fetch 実装）から ApiClient を作る。
 * fetchImpl 未指定時はグローバル fetch を **呼び出し時に** 解決する
 * （テストでの差し替えやアプリ側の global を尊重するため）。
 */
export function createApiClient(baseUrl: string, fetchImpl?: typeof fetch): ApiClient {
  const bearer = (token: string): HeadersInit => ({ authorization: `Bearer ${token}` });
  const doFetch: typeof fetch = (input, init) => (fetchImpl ?? fetch)(input, init);

  /** 空の局を作る POST 共通処理（新半荘=POST /games / 既存=POST /games/:id/kifu）。 */
  async function postCreateEmpty(
    url: string,
    token: string,
    cameraBottomSeat: Seat,
    meta?: KifuMetaInput,
  ): Promise<{ ok: true; gameId: string; logId: string } | { ok: false; status: number }> {
    const res = await doFetch(url, {
      method: "POST",
      headers: { ...bearer(token), "content-type": "application/json" },
      body: JSON.stringify({ cameraBottomSeat, meta }),
    });
    if (!res.ok) return { ok: false, status: res.status };
    const d = (await res.json()) as { gameId: string; logId: string };
    return { ok: true, gameId: d.gameId, logId: d.logId };
  }

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

    async getMyGames(token) {
      const res = await doFetch(`${baseUrl}/me/games`, { headers: bearer(token) });
      if (!res.ok) throw new Error(`my games failed: ${res.status}`);
      return res.json() as Promise<MyGameCard[]>;
    },

    async getPublicGames() {
      const res = await doFetch(`${baseUrl}/games/public`);
      if (!res.ok) throw new Error(`public games failed: ${res.status}`);
      return res.json() as Promise<PublicGameCard[]>;
    },

    async getGame(token, id) {
      const res = await doFetch(`${baseUrl}/games/${id}`, { headers: bearer(token) });
      if (res.status === 404) return null;
      if (!res.ok) throw new Error(`game failed: ${res.status}`);
      return res.json() as Promise<GameDetail>;
    },

    async getKifu(logId, token) {
      const res = await doFetch(
        `${baseUrl}/kifu/${logId}`,
        token ? { headers: bearer(token) } : undefined,
      );
      if (res.status === 404) return null;
      if (!res.ok) throw new Error(`kifu failed: ${res.status}`);
      return res.json() as Promise<GameLog>;
    },

    async getPublicGameDetail(gameId) {
      const res = await doFetch(`${baseUrl}/games/${gameId}/public`);
      if (res.status === 404) return null;
      if (!res.ok) throw new Error(`public game failed: ${res.status}`);
      return res.json() as Promise<PublicGameDetail>;
    },

    async analyze(token, form) {
      // content-type は付けない（fetch が multipart 境界を設定する）。
      const res = await doFetch(`${baseUrl}/analyze`, {
        method: "POST",
        headers: bearer(token),
        body: form,
      });
      if (res.ok) {
        const d = (await res.json()) as { gameId: string; logId: string };
        return { ok: true, gameId: d.gameId, logId: d.logId };
      }
      const body = (await res.json().catch(() => ({}))) as { reason?: string; error?: string };
      return { ok: false, status: res.status, reason: body.reason ?? body.error };
    },

    async updateKifu(token, logId, kifu) {
      const res = await doFetch(`${baseUrl}/kifu/${logId}`, {
        method: "PUT",
        headers: { ...bearer(token), "content-type": "application/json" },
        body: JSON.stringify(kifu),
      });
      return { ok: res.ok, status: res.status };
    },

    async createCheckout(token, params) {
      const res = await doFetch(`${baseUrl}/billing/checkout`, {
        method: "POST",
        headers: { ...bearer(token), "content-type": "application/json" },
        body: JSON.stringify(params),
      });
      if (!res.ok) return { ok: false, status: res.status };
      const d = (await res.json()) as { url: string };
      return { ok: true, url: d.url };
    },

    async setVisibility(token, logId, visibility) {
      const res = await doFetch(`${baseUrl}/kifu/${logId}/visibility`, {
        method: "PATCH",
        headers: { ...bearer(token), "content-type": "application/json" },
        body: JSON.stringify({ visibility }),
      });
      return { ok: res.ok, status: res.status };
    },

    async deleteKifu(token, logId) {
      const res = await doFetch(`${baseUrl}/kifu/${logId}`, {
        method: "DELETE",
        headers: bearer(token),
      });
      return { ok: res.ok, status: res.status };
    },

    async createGame(token, cameraBottomSeat, meta) {
      return postCreateEmpty(`${baseUrl}/games`, token, cameraBottomSeat, meta);
    },

    async createEmptyKifu(token, gameId, cameraBottomSeat, meta) {
      return postCreateEmpty(`${baseUrl}/games/${gameId}/kifu`, token, cameraBottomSeat, meta);
    },

    async updateProfile(token, update) {
      const res = await doFetch(`${baseUrl}/me/profile`, {
        method: "PUT",
        headers: { ...bearer(token), "content-type": "application/json" },
        body: JSON.stringify(update),
      });
      return { ok: res.ok, status: res.status };
    },

    async getPublicProfile(idOrHandle) {
      const res = await doFetch(`${baseUrl}/users/${encodeURIComponent(idOrHandle)}/profile`);
      if (res.status === 404) return null;
      if (!res.ok) throw new Error(`profile failed: ${res.status}`);
      return res.json() as Promise<PublicProfile>;
    },

    async deleteAccount(token) {
      const res = await doFetch(`${baseUrl}/me`, { method: "DELETE", headers: bearer(token) });
      return { ok: res.ok, status: res.status };
    },
  };
}
