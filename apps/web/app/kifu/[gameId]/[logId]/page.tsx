"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { KifuEditor } from "../../../../components/KifuEditor";
import { VisibilityToggle } from "../../../../components/VisibilityToggle";
import { fmtDate } from "../../../../lib/format";
import { useGame } from "../../../../lib/use-kifu-data";

export default function BoardPage() {
  const { gameId, logId } = useParams<{ gameId: string; logId: string }>();
  const { loading, detail } = useGame(gameId);
  const log = detail?.logs.find((l) => l.id === logId);

  return (
    <div>
      <p style={{ marginBottom: 8 }}>
        <Link href={`/kifu/${gameId}`}>← 半荘へ</Link>
      </p>

      {loading ? (
        <p style={{ color: "#aaa" }}>読み込み中…</p>
      ) : !log ? (
        <p style={{ color: "#888" }}>牌譜が見つかりませんでした。</p>
      ) : (
        <>
          <h1 style={{ fontSize: 18 }}>
            第 {log.seq} 局 <small style={{ color: "#999" }}>#{log.id}</small>
          </h1>
          <p style={{ color: "#888", fontSize: 13 }}>
            撮影: {fmtDate(log.kifu.capturedAt)} ／
            赤枠は「要確認」。下の一覧から選んで正しい牌に直せます。
          </p>
          <p style={{ marginBottom: 12 }}>
            <VisibilityToggle logId={log.id} ownerId={log.userId} initial={log.visibility} />
          </p>
          <KifuEditor initialKifu={log.kifu} kifuId={log.id} />
        </>
      )}
    </div>
  );
}
