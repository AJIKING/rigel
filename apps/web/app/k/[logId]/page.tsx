"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { KifuBoard } from "../../../components/KifuBoard";
import { fmtDate } from "../../../lib/format";
import { getKifu, type GameLog } from "../../../lib/api";
import { useAuth } from "../../../lib/auth-context";

/** 公開牌譜の読み取り表示（共有リンク先）。編集はしない。 */
export default function SharedKifuPage() {
  const { logId } = useParams<{ logId: string }>();
  const { token, loading: authLoading } = useAuth();
  const [log, setLog] = useState<GameLog | null>(null);
  const [state, setState] = useState<"loading" | "ok" | "notfound">("loading");

  useEffect(() => {
    if (authLoading) return;
    getKifu(logId, token ?? undefined)
      .then((l) => {
        setLog(l);
        setState(l ? "ok" : "notfound");
      })
      .catch(() => setState("notfound"));
  }, [authLoading, token, logId]);

  return (
    <div>
      <p style={{ marginBottom: 8 }}>
        <Link href="/kifu">← 牌譜一覧</Link>
      </p>
      {state === "loading" ? (
        <p style={{ color: "#aaa" }}>読み込み中…</p>
      ) : state === "notfound" || !log ? (
        <p style={{ color: "#888" }}>この牌譜は見つからないか、非公開です。</p>
      ) : (
        <>
          <p style={{ color: "#888", fontSize: 13 }}>
            撮影: {fmtDate(log.kifu.capturedAt)} ／ 公開牌譜（読み取り専用）
          </p>
          <KifuBoard kifu={log.kifu} />
        </>
      )}
    </div>
  );
}
