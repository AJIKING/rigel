"use client";

import Link from "next/link";
import { useGames } from "../../lib/use-kifu-data";

function fmtDate(iso: string): string {
  return iso.slice(0, 10);
}

export default function KifuListPage() {
  const { loading, games, sample, error } = useGames();

  return (
    <div>
      <h1>牌譜（半荘）一覧</h1>
      {sample && (
        <p style={{ color: "#a60", fontSize: 13 }}>
          サンプル表示中（ログインすると自分の半荘が表示されます）。
        </p>
      )}

      {loading ? (
        <p style={{ color: "#aaa" }}>読み込み中…</p>
      ) : error ? (
        <p style={{ color: "crimson" }}>{error}</p>
      ) : games.length === 0 ? (
        <p style={{ color: "#888" }}>
          まだ半荘がありません。アプリで卓を撮影して記録してください。
        </p>
      ) : (
        <ul style={{ listStyle: "none", padding: 0, display: "grid", gap: 10 }}>
          {games.map((game) => (
            <li key={game.id}>
              <Link
                href={`/kifu/${game.id}`}
                style={{
                  display: "block",
                  border: "1px solid #eee",
                  borderRadius: 10,
                  padding: 14,
                  textDecoration: "none",
                  color: "#222",
                }}
              >
                <strong>{game.title || "（無題の半荘）"}</strong>
                <div style={{ color: "#999", fontSize: 12, marginTop: 2 }}>
                  {fmtDate(game.createdAt)}
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
