import { notFound } from "next/navigation";
import { cache } from "react";
import { KifuViewer } from "../../../components/view/KifuViewer";
import { fetchMe, getPublicGameDetail } from "../../../lib/api-server";
import { loadGameDetail, normalizeDetailLogs } from "../../../lib/load-game";
import { buildGameMetadata } from "../../../lib/og-meta";
import { getSessionToken } from "../../../lib/session";
import { toViewerDetail } from "../../../lib/view-detail";

// generateMetadata とページ本体で同一リクエスト内のフェッチを共有する。
const getPublicDetail = cache((gameId: string) => getPublicGameDetail(gameId).catch(() => null));

// 動的OGP: 公開半荘はタイトル・説明・OGP/Twitterカードを半荘情報から組み立てる。
// 非公開・不存在はサイト既定へフォールバックし、半荘の存在も情報も漏らさない。
export async function generateMetadata({ params }: { params: Promise<{ gameId: string }> }) {
  const { gameId } = await params;
  return buildGameMetadata(await getPublicDetail(gameId));
}

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
  const raw = await getPublicDetail(gameId);
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
