import { redirect } from "next/navigation";
import { cache } from "react";
import { BoardEditor } from "../../../../components/board/BoardEditor";
import s from "../../../../components/board/board-editor.module.css";
import { loadGameDetail } from "../../../../lib/load-game";
import { getSessionToken } from "../../../../lib/session";

// generateMetadata とページ本体で同一リクエスト内のフェッチを共有する（/k と同じ流儀）。
const getOwnDetail = cache(async (gameId: string) => {
  const token = await getSessionToken();
  return token ? loadGameDetail(token, gameId) : null;
});

// 所有者専用エディタ。タブ名は開いている半荘（エディタのヘッダと同じ表記）。
// 本人専用ページなので検索結果には載せない。
export async function generateMetadata({ params }: { params: Promise<{ gameId: string }> }) {
  const { gameId } = await params;
  const detail = await getOwnDetail(gameId);
  const name = detail?.game.title || "無題の半荘";
  return { title: `${name} — 編集`, robots: { index: false } };
}

// 所有者専用エディタも SSR。Cookie セッションをサーバで読み、半荘をサーバ取得して
// 盤面を HTML に載せる。未ログインは /login、取得不可はダークな案内（白画面を出さない）。
export default async function BoardPage({
  params,
}: {
  params: Promise<{ gameId: string; logId: string }>;
}) {
  const { gameId, logId } = await params;
  const token = await getSessionToken();
  if (!token) redirect("/login");

  const detail = await getOwnDetail(gameId);
  if (!detail) {
    return (
      <div
        className={`${s.app} themeBoard`}
        style={{ display: "grid", placeItems: "center", padding: 24 }}
      >
        <p style={{ color: "var(--w70)" }}>この牌譜は見つからないか、権限がありません。</p>
      </div>
    );
  }
  return <BoardEditor initialDetail={detail} gameId={gameId} logId={logId} />;
}
