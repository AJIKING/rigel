import { KifuSchema } from "@rigel/schema";
import { notFound } from "next/navigation";
import { KifuViewer } from "../../../components/view/KifuViewer";
import { getPublicGameDetail } from "../../../lib/api-server";

// 公開ビューアは認証不要なので Server Component で取得・正規化して SSR する。
// これで初回から盤面が HTML に載り、白画面フラッシュも「読み込み中…」も出ない。
export default async function PublicGameViewPage({
  params,
}: {
  params: Promise<{ gameId: string }>;
}) {
  const { gameId } = await params;
  const raw = await getPublicGameDetail(gameId).catch(() => null);
  if (!raw) notFound();

  // 旧牌譜（rules/agari/meta の新フィールドが無い）に既定を埋めて正規化する。
  const detail = {
    ...raw,
    logs: raw.logs.map((l) => ({ ...l, kifu: KifuSchema.parse(l.kifu) })),
  };
  return <KifuViewer detail={detail} gameId={gameId} />;
}
