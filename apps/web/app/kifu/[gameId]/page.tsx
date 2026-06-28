"use client";

import { collectReviewItems } from "@rigel/ui";
import Link from "next/link";
import { useParams } from "next/navigation";
import { fmtDate } from "../../../lib/format";
import { useGame } from "../../../lib/use-kifu-data";

export default function GameDetailPage() {
  const { gameId } = useParams<{ gameId: string }>();
  const { loading, detail, sample, error } = useGame(gameId);

  return (
    <div>
      <p style={{ marginBottom: 8 }}>
        <Link href="/kifu">← 半荘一覧</Link>
      </p>

      {loading ? (
        <p style={{ color: "#aaa" }}>読み込み中…</p>
      ) : error ? (
        <p style={{ color: "crimson" }}>{error}</p>
      ) : !detail ? (
        <p style={{ color: "#888" }}>半荘が見つかりませんでした。</p>
      ) : (
        <>
          <h1 style={{ fontSize: 20 }}>{detail.game.title || "（無題の半荘）"}</h1>
          <p style={{ color: "#999", fontSize: 12 }}>
            {fmtDate(detail.game.createdAt)} ／ {detail.logs.length} 局
            {sample ? "（サンプル）" : ""}
          </p>

          {detail.logs.length === 0 ? (
            <p style={{ color: "#888" }}>この半荘にはまだ局がありません。</p>
          ) : (
            <ul style={{ listStyle: "none", padding: 0, display: "grid", gap: 8 }}>
              {detail.logs.map((log) => {
                const reviews = collectReviewItems(log.kifu).length;
                return (
                  <li key={log.id}>
                    <Link
                      href={`/kifu/${gameId}/${log.id}`}
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        border: "1px solid #eee",
                        borderRadius: 8,
                        padding: "10px 14px",
                        textDecoration: "none",
                        color: "#222",
                      }}
                    >
                      <span>
                        <strong>第 {log.seq} 局</strong>
                        <span style={{ color: "#999", marginLeft: 8, fontSize: 13 }}>
                          {log.kifu.result ?? "—"}
                        </span>
                      </span>
                      {reviews > 0 ? (
                        <span style={{ color: "#d10f3a", fontSize: 12 }}>要確認 {reviews}</span>
                      ) : (
                        <span style={{ color: "#1b7a2f", fontSize: 12 }}>確認済</span>
                      )}
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </>
      )}
    </div>
  );
}
