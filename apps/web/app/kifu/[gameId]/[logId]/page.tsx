import { redirect } from "next/navigation";
import { BoardEditor } from "../../../../components/board/BoardEditor";
import s from "../../../../components/board/board-editor.module.css";
import { loadGameDetail } from "../../../../lib/load-game";
import { getSessionToken } from "../../../../lib/session";

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

  const detail = await loadGameDetail(token, gameId);
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
