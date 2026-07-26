import { type AuthUser, type GameDetail, type PublicGameDetail } from "./api";

/**
 * 所有者として取得した半荘（GameDetail）を公開ビューアの形（PublicGameDetail）へ写す。
 * 非公開の半荘でも所有者は /k/[gameId] で再生できるようにするための変換
 * （mobile の半荘詳細「プレビュー」と同等の体験）。owner は自分のプロフィールから組み、
 * 取得に失敗しても半荘の userId で成立させる。
 */
export function toViewerDetail(own: GameDetail, me: AuthUser | null): PublicGameDetail {
  return {
    game: { id: own.game.id, title: own.game.title, createdAt: own.game.createdAt },
    owner: {
      id: me?.id ?? own.game.userId,
      handle: me?.handle ?? null,
      displayName: me?.displayName ?? "",
    },
    logs: own.logs,
    favoriteCount: own.favoriteCount,
    viewerFaved: own.viewerFaved,
  };
}
