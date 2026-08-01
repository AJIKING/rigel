// ============================================================
// @rigel/client — api(Workers) を叩く薄いクライアント（web/mobile 共有）
// ------------------------------------------------------------
// baseUrl だけ差し替えれば web(Next) / mobile(Expo) どちらからも使える。
// fetch は注入可能（テスト用）。型(DTO)もここに集約して両アプリの drift を防ぐ。
// ============================================================

import type {
  Kifu,
  PaidPlan,
  Plan,
  Players,
  Problem,
  ProblemAction,
  QuizKind,
  QuizResult,
  Rules,
  Seat,
} from "@rigel/schema";

/** 作成時に渡せる局メタ（本場/供託/ドラ/最終巡目）。記録のみ・点数計算はしない。 */
export type KifuMetaInput = Partial<Pick<Kifu["meta"], "honba" | "kyotaku" | "dora" | "junme">>;

// プラン型は背骨（@rigel/schema の plan.ts）が単一真実源。従来の名前のまま re-export する。
export type { PaidPlan, Plan } from "@rigel/schema";
export type Visibility = "public" | "private";
/** 編集状態。draft=下書き / complete=編集済（公開フィードに出る）。 */
export type KifuStatus = "draft" | "complete";
/** 何切る問題の状態。draft=下書き（所有者のみ） / published=公開（誰でも閲覧可）。 */
export type ProblemStatus = "draft" | "published";

/** 何切る問題1件（API は createdAt を ISO 文字列で返す）。 */
export interface ProblemPost extends FavoriteFields {
  id: string;
  userId: string;
  title: string;
  problem: Problem;
  status: ProblemStatus;
  createdAt: string;
}

/** 回答分布（choiceKey → 件数）＋自分の回答。stats API（認証必須）が返す。 */
export interface ProblemStats {
  counts: Record<string, number>;
  total: number;
  myChoiceKey: string | null;
  myAction: ProblemAction | null;
}

/** 特訓クイズの完了済みセッション1件（本人の履歴のみ。API は createdAt を ISO 文字列で返す）。 */
export interface QuizSessionDto {
  id: string;
  kind: QuizKind;
  total: number;
  correct: number;
  durationMs: number;
  createdAt: string;
}

/** 特訓クイズ開始の結果。remainingToday は本日の残り回数（有料は null=無制限）。 */
export type StartQuizSessionResult =
  | { ok: true; id: string; remainingToday: number | null }
  | { ok: false; status: number; reason?: string };

export interface AuthUser {
  id: string;
  plan: Plan;
  /** 有料プランの購入経路（RevenueCat の store 値: "APP_STORE"|"PLAY_STORE"|"STRIPE"等）。
   *  free / 不明（旧データ）は null。web の購読管理の出し分けに使う。 */
  planStore?: string | null;
  /** 公開ハンドル(@xxx)。未設定は null。 */
  handle?: string | null;
  /** 表示名。 */
  displayName?: string;
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
  /** この半荘のお気に入り数（ビューアの★に添える）。 */
  favoriteCount: number;
  /** 見ている人が付けているか（未ログインは false）。 */
  viewerFaved: boolean;
}

export interface AuthResult {
  sessionToken: string;
  user: AuthUser;
  /** 初回ログインで作成したら true（計測の sign_up/login 出し分けに使う）。 */
  created: boolean;
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
  status: KifuStatus;
  createdAt: string;
}

export interface GameDetail {
  game: Game;
  logs: GameLog[];
  /** この半荘のお気に入り数（所有者プレビューの★に添える）。 */
  favoriteCount: number;
  viewerFaved: boolean;
}

/** マイページの半荘カード（局数・公開数・下書き数つき）。 */
/** お気に入り（★）を付けられる対象の種別。 */
export type FavoriteTargetType = "game" | "problem";

/**
 * 一覧カードに載るお気に入り情報。API は「件数」と「自分が付けたか」だけを返し、
 * 誰が付けたかは返さない。人気順（お気に入りが多い順）の並べ替えは favoriteCount を使う。
 */
export interface FavoriteFields {
  favoriteCount: number;
  viewerFaved: boolean;
}

export interface MyGameCard extends FavoriteFields {
  id: string;
  title: string;
  createdAt: string;
  kyokuCount: number;
  publicCount: number;
  /** 下書き(draft)の局数（0 なら全局が編集済）。 */
  draftCount: number;
}

/** 公開牌譜フィードの半荘カード。 */
export interface PublicGameCard extends FavoriteFields {
  id: string;
  ownerId: string;
  /** 著者ハンドル(@なし)。プロフィール非公開・未設定なら null。 */
  ownerHandle: string | null;
  /** 著者の表示名。プロフィール非公開なら null。 */
  ownerName: string | null;
  title: string;
  createdAt: string;
  kyokuCount: number;
  /** 最新の公開局ID（読み取り表示先 /k/[logId]）。 */
  firstLogId: string;
}

/** マイページ「お気に入り」タブの半荘カード（他人の公開半荘＋自分の半荘）。 */
export interface FavoriteGameCard extends PublicGameCard {
  /** 自分が所有する半荘か（true なら編集画面 /kifu/[id]、false なら公開ビューア /k/[id] へ）。 */
  mine: boolean;
}

/** マイページ「お気に入り」タブの何切るカード。 */
export interface FavoriteProblemCard extends ProblemPost {
  mine: boolean;
  ownerHandle: string | null;
  ownerName: string | null;
}

/** 自分のお気に入り一覧（付けた新しい順。非公開に戻された・削除された対象は含まれない）。 */
export interface MyFavorites {
  games: FavoriteGameCard[];
  problems: FavoriteProblemCard[];
}

/** お気に入りの付け外しの結果（favoriteCount は反映後の件数）。 */
export type SetFavoriteResult =
  { ok: true; faved: boolean; favoriteCount: number } | { ok: false; status: number };

export type AnalyzeResult =
  { ok: true; gameId: string; logId: string } | { ok: false; status: number; reason?: string };

/** 何切るの写真AI再現の結果（保存はされない。Kifu 形のドラフトが返る）。 */
export type AnalyzeProblemResult =
  { ok: true; kifu: Kifu } | { ok: false; status: number; reason?: string };

export type CheckoutResult = { ok: true; url: string } | { ok: false; status: number };

export interface ApiClient {
  /** Google ID トークンでログインし、セッショントークンとユーザーを得る。 */
  authWithGoogle(idToken: string): Promise<AuthResult>;
  /** Apple ID トークンでログイン（App Store 審査要件 4.8）。authorizationCode は
   *  退会時のトークン失効用の refresh token 交換に使う（任意）。 */
  authWithApple(idToken: string, authorizationCode?: string): Promise<AuthResult>;
  /** ストア審査用の合言葉ログイン（審査ユーザー専用。サーバーの Secret 未設定時は 501）。 */
  authWithReviewCode(code: string): Promise<AuthResult>;
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
  /**
   * 何切るの写真AI再現。撮影画像から盤面ドラフト（Kifu 形）を得る（保存はされない）。
   * フォーム: hand(必須=自分の手牌), river(任意), cameraBottomSeat(任意=出題視点)。
   */
  analyzeProblem(token: string, form: FormData): Promise<AnalyzeProblemResult>;
  /** 牌譜の修正を保存する（所有者のみ）。seq=局順（東一局=1〜北四局=16。省略は現状維持）。 */
  updateKifu(
    token: string,
    logId: string,
    kifu: Kifu,
    seq?: number,
  ): Promise<{ ok: boolean; status: number }>;
  /** 半荘の編集状態（下書き/編集済）を変更する（配下の全局に反映。所有者のみ）。 */
  setGameStatus(
    token: string,
    gameId: string,
    status: KifuStatus,
  ): Promise<{ ok: boolean; status: number }>;
  /**
   * 指定プラン(next/pro)へのアップグレード Checkout を開始し、決済ページURLを得る。
   * urls は決済後/中断後の戻り先（各アプリが自分のオリジンで組む）。
   * 課金未設定(501)や失敗時は ok:false（status 付き）。
   */
  createCheckout(
    token: string,
    params: { plan: PaidPlan; successUrl: string; cancelUrl: string },
  ): Promise<CheckoutResult>;
  /**
   * 決済ポータル（プラン変更・解約・支払い方法の管理）のURLを得る。加入中ユーザー専用。
   * 未加入(404)・課金未設定(501)などは ok:false（status 付き）。
   */
  createPortal(token: string, params: { returnUrl: string }): Promise<CheckoutResult>;
  /** 牌譜（局）を削除する（所有者のみ）。成否を返す。 */
  deleteKifu(token: string, logId: string): Promise<{ ok: boolean; status: number }>;
  /** 半荘を配下の全局ごと削除する（所有者のみ）。成否を返す。 */
  deleteGame(token: string, gameId: string): Promise<{ ok: boolean; status: number }>;
  /** 半荘名・対局日を変更する（所有者のみ・少なくとも一方）。
   *  createdAt は "YYYY-MM-DD" か ISO 日時。成否を返す。 */
  updateGame(
    token: string,
    gameId: string,
    input: { title?: string; createdAt?: string },
  ): Promise<{ ok: boolean; status: number }>;
  /** 半荘のルールを変更する（配下の全局に反映。所有者のみ）。成否を返す。 */
  updateGameRules(
    token: string,
    gameId: string,
    rules: Rules,
  ): Promise<{ ok: boolean; status: number }>;
  /** 半荘の選手情報（選手名・リーグ戦ポイント）を変更する（配下の全局に反映。
   *  所有者のみ）。null で「記録しない対局」へ戻す。成否を返す。 */
  updateGamePlayers(
    token: string,
    gameId: string,
    players: Players | null,
  ): Promise<{ ok: boolean; status: number }>;
  /** 半荘の公開範囲を変更する（配下の全局に反映。所有者のみ）。成否を返す。 */
  setGameVisibility(
    token: string,
    gameId: string,
    visibility: Visibility,
  ): Promise<{ ok: boolean; status: number }>;
  /** 新しい半荘を「空の初局」つきで作る（手動入力の起点）。成功で gameId/logId を返す。 */
  createGame(
    token: string,
    cameraBottomSeat: Seat,
    meta?: KifuMetaInput,
    /** 局順（東一局=1〜北四局=16）。省略時は東一局。 */
    seq?: number,
  ): Promise<{ ok: true; gameId: string; logId: string } | { ok: false; status: number }>;
  /** 半荘に空の局を追加する（手動入力の起点）。成功で gameId/新しい logId を返す。 */
  createEmptyKifu(
    token: string,
    gameId: string,
    cameraBottomSeat: Seat,
    meta?: KifuMetaInput,
    /** 局順（東一局=1〜北四局=16）。省略時は既存の次の局。 */
    seq?: number,
  ): Promise<{ ok: true; gameId: string; logId: string } | { ok: false; status: number }>;
  /** プロフィール（handle/表示名/公開）を更新する。handle 重複は status 409。 */
  updateProfile(
    token: string,
    update: { handle?: string; displayName?: string },
  ): Promise<{ ok: boolean; status: number }>;
  /** 別ユーザーの公開プロフィール（handle か id）。見つからなければ null。認証不要。 */
  getPublicProfile(idOrHandle: string): Promise<PublicProfile | null>;
  /** 自分のアカウントを削除する（取り消し不可）。 */
  deleteAccount(token: string): Promise<{ ok: boolean; status: number }>;
  /** 公開中の何切る問題一覧（新着順）。認証不要。 */
  getPublicProblems(): Promise<ProblemPost[]>;
  /** 自分の何切る問題一覧（draft 含む）。 */
  getMyProblems(token: string): Promise<ProblemPost[]>;
  /** 何切る問題1件。published は誰でも・draft は所有者のみ（他人は null）。 */
  getProblem(problemId: string, token?: string): Promise<ProblemPost | null>;
  /** 何切る問題を作成する。free の上限超過は status 403。 */
  createProblem(
    token: string,
    input: { title: string; problem: Problem; status?: ProblemStatus },
  ): Promise<{ ok: true; problemId: string } | { ok: false; status: number }>;
  /** 何切る問題を更新する（タイトル・問題本体・draft/published 切替。所有者のみ）。 */
  updateProblem(
    token: string,
    problemId: string,
    input: { title?: string; problem?: Problem; status?: ProblemStatus },
  ): Promise<{ ok: boolean; status: number }>;
  /** 何切る問題を削除する（回答ごと。所有者のみ）。 */
  deleteProblem(token: string, problemId: string): Promise<{ ok: boolean; status: number }>;
  /** 回答する（1人1回・再回答は上書き）。分布は getProblemStats で別途取る。 */
  answerProblem(
    token: string,
    problemId: string,
    action: ProblemAction,
  ): Promise<{ ok: boolean; status: number }>;
  /** 回答分布＋自分の回答（認証必須）。見つからなければ null。 */
  getProblemStats(token: string, problemId: string): Promise<ProblemStats | null>;
  /** 特訓クイズを開始する（無料は1日3回・開始時に1回消費。超過は status 402）。 */
  startQuizSession(token: string, kind: QuizKind): Promise<StartQuizSessionResult>;
  /** 60秒セッションの結果（クライアント採点）を記録する。他人の行・不存在は status 404。 */
  finishQuizSession(
    token: string,
    sessionId: string,
    result: QuizResult,
  ): Promise<{ ok: boolean; status: number }>;
  /** 自分の完了済みセッション履歴（新しい順・since=ISO8601 で期間指定）。 */
  listQuizSessions(token: string, since?: string): Promise<QuizSessionDto[]>;

  /** お気に入りを付ける/外す（冪等）。自分に見えない対象は ok:false（status 404）。 */
  setFavorite(
    token: string,
    targetType: FavoriteTargetType,
    targetId: string,
    faved: boolean,
  ): Promise<SetFavoriteResult>;
  /** 自分のお気に入り一覧（半荘・何切る。付けた新しい順）。 */
  listMyFavorites(token: string): Promise<MyFavorites>;
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
    seq?: number,
  ): Promise<{ ok: true; gameId: string; logId: string } | { ok: false; status: number }> {
    const res = await doFetch(url, {
      method: "POST",
      headers: { ...bearer(token), "content-type": "application/json" },
      body: JSON.stringify({ cameraBottomSeat, meta, seq }),
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

    async authWithApple(idToken, authorizationCode) {
      const res = await doFetch(`${baseUrl}/auth/apple`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ idToken, authorizationCode }),
      });
      if (!res.ok) throw new Error(`auth failed: ${res.status}`);
      return res.json() as Promise<AuthResult>;
    },

    async authWithReviewCode(code) {
      const res = await doFetch(`${baseUrl}/auth/review`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ code }),
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

    async analyzeProblem(token, form) {
      // content-type は付けない（fetch が multipart 境界を設定する）。
      const res = await doFetch(`${baseUrl}/problems/analyze`, {
        method: "POST",
        headers: bearer(token),
        body: form,
      });
      if (res.ok) {
        const d = (await res.json()) as { kifu: Kifu };
        return { ok: true, kifu: d.kifu };
      }
      const body = (await res.json().catch(() => ({}))) as { reason?: string; error?: string };
      return { ok: false, status: res.status, reason: body.reason ?? body.error };
    },

    async updateKifu(token, logId, kifu, seq) {
      const res = await doFetch(`${baseUrl}/kifu/${logId}`, {
        method: "PUT",
        headers: { ...bearer(token), "content-type": "application/json" },
        body: JSON.stringify({ kifu, seq }),
      });
      return { ok: res.ok, status: res.status };
    },

    async setGameStatus(token, gameId, status) {
      const res = await doFetch(`${baseUrl}/games/${gameId}/status`, {
        method: "PATCH",
        headers: { ...bearer(token), "content-type": "application/json" },
        body: JSON.stringify({ status }),
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

    async createPortal(token, params) {
      const res = await doFetch(`${baseUrl}/billing/portal`, {
        method: "POST",
        headers: { ...bearer(token), "content-type": "application/json" },
        body: JSON.stringify(params),
      });
      if (!res.ok) return { ok: false, status: res.status };
      const d = (await res.json()) as { url: string };
      return { ok: true, url: d.url };
    },

    async deleteKifu(token, logId) {
      const res = await doFetch(`${baseUrl}/kifu/${logId}`, {
        method: "DELETE",
        headers: bearer(token),
      });
      return { ok: res.ok, status: res.status };
    },

    async deleteGame(token, gameId) {
      const res = await doFetch(`${baseUrl}/games/${gameId}`, {
        method: "DELETE",
        headers: bearer(token),
      });
      return { ok: res.ok, status: res.status };
    },

    async updateGame(token, gameId, input) {
      const res = await doFetch(`${baseUrl}/games/${gameId}`, {
        method: "PATCH",
        headers: { ...bearer(token), "content-type": "application/json" },
        body: JSON.stringify(input),
      });
      return { ok: res.ok, status: res.status };
    },

    async updateGameRules(token, gameId, rules) {
      const res = await doFetch(`${baseUrl}/games/${gameId}/rules`, {
        method: "PATCH",
        headers: { ...bearer(token), "content-type": "application/json" },
        body: JSON.stringify({ rules }),
      });
      return { ok: res.ok, status: res.status };
    },

    async updateGamePlayers(token, gameId, players) {
      const res = await doFetch(`${baseUrl}/games/${gameId}/players`, {
        method: "PATCH",
        headers: { ...bearer(token), "content-type": "application/json" },
        body: JSON.stringify({ players }),
      });
      return { ok: res.ok, status: res.status };
    },

    async setGameVisibility(token, gameId, visibility) {
      const res = await doFetch(`${baseUrl}/games/${gameId}/visibility`, {
        method: "PATCH",
        headers: { ...bearer(token), "content-type": "application/json" },
        body: JSON.stringify({ visibility }),
      });
      return { ok: res.ok, status: res.status };
    },

    async createGame(token, cameraBottomSeat, meta, seq) {
      return postCreateEmpty(`${baseUrl}/games`, token, cameraBottomSeat, meta, seq);
    },

    async createEmptyKifu(token, gameId, cameraBottomSeat, meta, seq) {
      return postCreateEmpty(`${baseUrl}/games/${gameId}/kifu`, token, cameraBottomSeat, meta, seq);
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

    async getPublicProblems() {
      const res = await doFetch(`${baseUrl}/problems`);
      if (!res.ok) throw new Error(`problems failed: ${res.status}`);
      return res.json() as Promise<ProblemPost[]>;
    },

    async getMyProblems(token) {
      const res = await doFetch(`${baseUrl}/problems/mine`, { headers: bearer(token) });
      if (!res.ok) throw new Error(`my problems failed: ${res.status}`);
      return res.json() as Promise<ProblemPost[]>;
    },

    async getProblem(problemId, token) {
      const res = await doFetch(`${baseUrl}/problems/${problemId}`, {
        headers: token ? bearer(token) : undefined,
      });
      if (res.status === 404) return null;
      if (!res.ok) throw new Error(`problem failed: ${res.status}`);
      return res.json() as Promise<ProblemPost>;
    },

    async createProblem(token, input) {
      const res = await doFetch(`${baseUrl}/problems`, {
        method: "POST",
        headers: { ...bearer(token), "content-type": "application/json" },
        body: JSON.stringify(input),
      });
      if (!res.ok) return { ok: false, status: res.status };
      const d = (await res.json()) as { problemId: string };
      return { ok: true, problemId: d.problemId };
    },

    async updateProblem(token, problemId, input) {
      const res = await doFetch(`${baseUrl}/problems/${problemId}`, {
        method: "PUT",
        headers: { ...bearer(token), "content-type": "application/json" },
        body: JSON.stringify(input),
      });
      return { ok: res.ok, status: res.status };
    },

    async deleteProblem(token, problemId) {
      const res = await doFetch(`${baseUrl}/problems/${problemId}`, {
        method: "DELETE",
        headers: bearer(token),
      });
      return { ok: res.ok, status: res.status };
    },

    async answerProblem(token, problemId, action) {
      const res = await doFetch(`${baseUrl}/problems/${problemId}/answers`, {
        method: "POST",
        headers: { ...bearer(token), "content-type": "application/json" },
        body: JSON.stringify({ action }),
      });
      return { ok: res.ok, status: res.status };
    },

    async getProblemStats(token, problemId) {
      const res = await doFetch(`${baseUrl}/problems/${problemId}/stats`, {
        headers: bearer(token),
      });
      if (res.status === 404) return null;
      if (!res.ok) throw new Error(`problem stats failed: ${res.status}`);
      return res.json() as Promise<ProblemStats>;
    },

    async startQuizSession(token, kind) {
      const res = await doFetch(`${baseUrl}/quiz/sessions`, {
        method: "POST",
        headers: { ...bearer(token), "content-type": "application/json" },
        body: JSON.stringify({ kind }),
      });
      if (res.ok) {
        const d = (await res.json()) as { id: string; remainingToday: number | null };
        return { ok: true, id: d.id, remainingToday: d.remainingToday };
      }
      const body = (await res.json().catch(() => ({}))) as { reason?: string; error?: string };
      return { ok: false, status: res.status, reason: body.reason ?? body.error };
    },

    async finishQuizSession(token, sessionId, result) {
      const res = await doFetch(`${baseUrl}/quiz/sessions/${sessionId}`, {
        method: "PATCH",
        headers: { ...bearer(token), "content-type": "application/json" },
        body: JSON.stringify(result),
      });
      return { ok: res.ok, status: res.status };
    },

    async listQuizSessions(token, since) {
      const query = since === undefined ? "" : `?since=${encodeURIComponent(since)}`;
      const res = await doFetch(`${baseUrl}/quiz/sessions${query}`, { headers: bearer(token) });
      if (!res.ok) throw new Error(`quiz sessions failed: ${res.status}`);
      return res.json() as Promise<QuizSessionDto[]>;
    },

    async setFavorite(token, targetType, targetId, faved) {
      const res = await doFetch(
        `${baseUrl}/favorites/${targetType}/${encodeURIComponent(targetId)}`,
        { method: faved ? "PUT" : "DELETE", headers: bearer(token) },
      );
      if (!res.ok) return { ok: false, status: res.status };
      return (await res.json()) as { ok: true; faved: boolean; favoriteCount: number };
    },

    async listMyFavorites(token) {
      const res = await doFetch(`${baseUrl}/favorites`, { headers: bearer(token) });
      if (!res.ok) throw new Error(`favorites failed: ${res.status}`);
      return res.json() as Promise<MyFavorites>;
    },
  };
}
