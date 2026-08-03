// interfaces/http — ルート実装の共有部品（型・ガード・整形）。
// 各 routes/*.ts と app.ts から使う。HTTP の都合だけを扱う。

import type { Context, MiddlewareHandler } from "hono";
import type { AppContainer } from "../../composition-root";
import type { Env } from "../../env";
import type { FavoriteTargetType } from "../../domain/favorite/favorite.repository";
import type { User } from "../../domain/user/user";

export type AppEnv = {
  Bindings: Env;
  Variables: { container: AppContainer; userId?: string };
};

/** 一覧カードに載せるお気に入りの情報（件数と、見ている人が付けているか）。
 *  「誰が付けたか」は含めない（件数と自分の状態だけ）。 */
export interface FavoriteFields {
  favoriteCount: number;
  viewerFaved: boolean;
}

/**
 * 一覧カードに★（件数・自分が付けたか）を重ねる。
 * 未ログインでも件数は返し、viewerFaved は常に false。
 * 集計は表示中の id ぶんだけ引く（全件走査にしない）。
 */
export async function withFavorites<T extends { id: string }>(
  c: Context<AppEnv>,
  targetType: FavoriteTargetType,
  cards: readonly T[],
): Promise<(T & FavoriteFields)[]> {
  const { counts, mine } = await c.get("container").getFavoriteSummary.execute({
    viewerId: c.get("userId"),
    targetType,
    targetIds: cards.map((x) => x.id),
  });
  const faved = new Set(mine);
  return cards.map((x) => ({
    ...x,
    favoriteCount: counts[x.id] ?? 0,
    viewerFaved: faved.has(x.id),
  }));
}

/** 元写真バイトの配信レスポンス（半荘・何切る共通）。本人専用・不変オブジェクトなので
 *  ブラウザキャッシュのみ許可（**共有キャッシュに乗せない**。photo-retention.md）。 */
export function photoBody(c: Context<AppEnv>, photo: { data: ArrayBuffer; mimeType: string }) {
  return c.body(photo.data, 200, {
    "content-type": photo.mimeType,
    "cache-control": "private, max-age=86400",
  });
}

/** 問題の JSON 整形。photoDraftId（R2 プレフィックスの内部 ID）は所有者にだけ返す
 *  （最小露出。写真配信自体は所有者ガード済みだが、内部識別子を公開ペイロードに出さない）。 */
export function problemJson<T extends { userId: string; photoDraftId?: string | null }>(
  post: T,
  viewerId: string | null | undefined,
): Omit<T, "photoDraftId"> & { photoDraftId?: string | null } {
  if (post.userId === viewerId) return post;
  const { photoDraftId: _omit, ...rest } = post;
  return rest;
}

/** 認証必須ルートのガード。userId（認証ミドルウェアが載せる）が無ければ 401。 */
export const requireAuth: MiddlewareHandler<AppEnv> = async (c, next) => {
  if (!c.get("userId")) return c.json({ error: "unauthorized" }, 401);
  await next();
};

/** ユースケースの失敗理由を HTTP ステータスに対応づける（ルート間で統一）。 */
export function reasonStatus(reason: string): 400 | 402 | 403 | 404 | 409 {
  switch (reason) {
    case "quota_exceeded":
      return 402;
    case "private_limit":
    case "draft_limit":
    case "problem_limit":
      return 403;
    case "game_full":
    case "game_analyzing":
    case "not_failed":
      return 409;
    case "game_not_found":
    case "not_found":
      return 404;
    default:
      return 400;
  }
}

/** /auth/google と /me が共通で返すユーザープロフィール項目（JSON 整形）。
 *  email は運用専用のため絶対に含めない（外部に出さない）。 */
export function userProfileJson(user: User) {
  return {
    id: user.id,
    plan: user.plan,
    /** 有料プランの購入経路（"APP_STORE"|"PLAY_STORE"|"STRIPE"等・free は null）。
     *  web の購読管理の出し分け（Stripe ポータル vs ストアの購読設定）に使う。 */
    planStore: user.planStore,
    handle: user.handle,
    displayName: user.displayName,
  };
}
