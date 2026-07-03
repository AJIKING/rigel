import { useRoute, type RouteProp } from "@react-navigation/native";
import { authorLabel } from "@rigel/ui";
import { useEffect, useState } from "react";
import { CenterState } from "../components/CenterState";
import { KifuPlayer } from "../components/KifuPlayer";
import { getPublicGameDetail, type PublicGameDetail } from "../lib/api";
import type { RootStackParamList } from "../lib/navigation";

/** 公開半荘の読み取り専用ビューア（認証不要）。 */
export function PublicGameScreen() {
  const { gameId, logId } = useRoute<RouteProp<RootStackParamList, "PublicGame">>().params;
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

  return (
    <KifuPlayer
      logs={logs}
      title={game.title || "（無題の半荘）"}
      authorLabel={author}
      ownerName={owner.displayName || author}
      initialIndex={initialIndex}
      isPublic
    />
  );
}
