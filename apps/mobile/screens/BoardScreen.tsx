import { useRoute, type RouteProp } from "@react-navigation/native";
import { CenterState } from "../components/CenterState";
import { KifuPlayer } from "../components/KifuPlayer";
import type { RootStackParamList } from "../lib/navigation";
import { useGame } from "../lib/use-kifu-data";

export function BoardScreen() {
  const { gameId, logId } = useRoute<RouteProp<RootStackParamList, "Board">>().params;
  const { loading, detail } = useGame(gameId);

  if (loading) return <CenterState loading />;

  const initialIndex = detail ? detail.logs.findIndex((l) => l.id === logId) : -1;
  // 要求された logId が半荘に無い（失効・削除済み等）ときは、別の局を無言で開かず not-found に。
  if (!detail || initialIndex === -1) {
    return <CenterState message="牌譜が見つかりませんでした。" />;
  }

  return (
    <KifuPlayer
      logs={detail.logs}
      title={detail.game.title || "（無題の半荘）"}
      initialIndex={initialIndex}
    />
  );
}
