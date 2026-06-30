"use client";

import { useParams, useRouter } from "next/navigation";
import { useEffect } from "react";
import { useGame } from "../../../lib/use-kifu-data";

/** 半荘を開いたら最初の局（盤面エディタ）へ送る。局が無ければ一覧へ戻す。 */
export default function GameRedirectPage() {
  const { gameId } = useParams<{ gameId: string }>();
  const router = useRouter();
  const { loading, detail, error } = useGame(gameId);

  useEffect(() => {
    if (loading || !detail) return;
    const first = detail.logs[0];
    router.replace(first ? `/kifu/${gameId}/${first.id}` : "/kifu");
  }, [loading, detail, gameId, router]);

  return <p style={{ color: "#888", padding: 24 }}>{error ?? "開いています…"}</p>;
}
