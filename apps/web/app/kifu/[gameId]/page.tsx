import { redirect } from "next/navigation";
import { loadGameDetail } from "../../../lib/load-game";
import { getSessionToken } from "../../../lib/session";

// 半荘を開いたら最初の局（盤面エディタ）へ送る。局が無ければ一覧へ。未ログインは /login。
export default async function GameRedirectPage({
  params,
}: {
  params: Promise<{ gameId: string }>;
}) {
  const { gameId } = await params;
  const token = await getSessionToken();
  if (!token) redirect("/login");

  const detail = await loadGameDetail(token, gameId);
  const first = detail?.logs[0];
  redirect(first ? `/kifu/${gameId}/${first.id}` : "/kifu");
}
