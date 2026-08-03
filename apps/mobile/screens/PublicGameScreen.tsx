import { useNavigation, useRoute, type RouteProp } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { authorLabel } from "@rigel/ui";
import { useEffect, useState } from "react";
import { CenterState } from "../components/CenterState";
import { KifuPlayer } from "../components/KifuPlayer";
import { getPublicGameDetail, type PublicGameDetail } from "../lib/api";
import { useAuth } from "../lib/auth";
import type { RootStackParamList } from "../lib/navigation";
import { useFavorites } from "../lib/use-favorites";

type Nav = NativeStackNavigationProp<RootStackParamList, "PublicGame">;

/** 公開半荘の読み取り専用ビューア（認証不要）。 */
export function PublicGameScreen() {
  const nav = useNavigation<Nav>();
  const { gameId, logId } = useRoute<RouteProp<RootStackParamList, "PublicGame">>().params;
  const { user } = useAuth();
  // ★はサーバー保存。詳細レスポンスの favoriteCount/viewerFaved に画面の操作を重ねる
  // （web KifuViewer と同一。Phase D）。
  const { apply, toggle: toggleFav } = useFavorites();
  const [state, setState] = useState<{ loading: boolean; detail: PublicGameDetail | null }>({
    loading: true,
    detail: null,
  });

  useEffect(() => {
    let active = true;
    getPublicGameDetail(gameId)
      .then((detail) => active && setState({ loading: false, detail }))
      .catch(() => active && setState({ loading: false, detail: null }));
    return () => {
      active = false;
    };
  }, [gameId]);

  if (state.loading) return <CenterState loading />;
  if (!state.detail) return <CenterState message="公開牌譜が見つかりませんでした。" />;

  const { game, owner, logs } = state.detail;
  const author = authorLabel({ handle: owner.handle, name: owner.displayName });
  // カードが指す局(firstLogId)を初期表示に。見つからなければ先頭。
  const initialIndex = Math.max(0, logId ? logs.findIndex((l) => l.id === logId) : 0);
  const [favCard] = apply([
    {
      id: gameId,
      favoriteCount: state.detail.favoriteCount,
      viewerFaved: state.detail.viewerFaved,
    },
  ]);

  return (
    <KifuPlayer
      logs={logs}
      title={game.title || "（無題の半荘）"}
      authorLabel={author}
      ownerName={owner.displayName || author}
      initialIndex={initialIndex}
      isPublic
      fav={{
        faved: favCard!.viewerFaved,
        count: favCard!.favoriteCount,
        onToggle: () => toggleFav("game", favCard!),
      }}
      // 自分の牌譜なら編集導線（半荘詳細へ。web の「編集」リンクと対）。
      onEdit={user?.id === owner.id ? () => nav.navigate("GameDetail", { gameId }) : undefined}
    />
  );
}
