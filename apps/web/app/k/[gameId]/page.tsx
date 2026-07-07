import { notFound } from "next/navigation";
import { KifuViewer } from "../../../components/view/KifuViewer";
import { fetchMe, getPublicGameDetail } from "../../../lib/api-server";
import { loadGameDetail, normalizeDetailLogs } from "../../../lib/load-game";
import { getSessionToken } from "../../../lib/session";
import { toViewerDetail } from "../../../lib/view-detail";

// 公開ビューアは認証不要なので Server Component で取得・正規化して SSR する。
// これで初回から盤面が HTML に載り、白画面フラッシュも「読み込み中…」も出ない。
// 非公開の半荘でも所有者なら Cookie セッションで取得して再生できる
// （mobile の半荘詳細「プレビュー」と同等。他人には存在ごと隠す=404）。
export default async function PublicGameViewPage({
  params,
}: {
  params: Promise<{ gameId: string }>;
}) {
  const { gameId } = await params;
  const raw = await getPublicGameDetail(gameId).catch(() => null);
  if (raw) {
    return <KifuViewer detail={normalizeDetailLogs(raw)} gameId={gameId} />;
  }

  // 公開されていない → 所有者の再生（非公開プレビュー）を試みる。
  const token = await getSessionToken();
  if (!token) notFound();
  const own = await loadGameDetail(token, gameId); // 所有者のみ取得可・正規化込み
  if (!own) notFound();
  const me = await fetchMe(token).catch(() => null);
  return <KifuViewer detail={toViewerDetail(own, me)} gameId={gameId} />;
}
