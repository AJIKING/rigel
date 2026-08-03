import { redirect } from "next/navigation";
import { GameHeaderScreen } from "../../../components/board/GameHeaderScreen";
import { loadGameDetail } from "../../../lib/load-game";
import { getSessionToken } from "../../../lib/session";

// 半荘を開いたら最初の局（盤面エディタ）へ送る。未ログインは /login。
// 局が無い半荘（解析中・解析失敗）は軽量の半荘ヘッダビューを出す
// （以前は /mypage へ逃がしていて 0局半荘が開けなかった。Phase C）。
export default async function GameRedirectPage({
  params,
}: {
  params: Promise<{ gameId: string }>;
}) {
  const { gameId } = await params;
  const token = await getSessionToken();
  if (!token) redirect("/login");

  const detail = await loadGameDetail(token, gameId);
  if (!detail) redirect("/mypage");
  const first = detail.logs[0];
  if (first) redirect(`/kifu/${gameId}/${first.id}`);
  return <GameHeaderScreen gameId={gameId} initial={detail} />;
}
