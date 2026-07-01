"use client";

import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { getGame } from "../../../lib/api";
import { useAuth } from "../../../lib/auth-context";

/** 半荘を開いたら最初の局（盤面エディタ）へ送る。局が無ければ一覧へ戻す。 */
export default function GameRedirectPage() {
  const { gameId } = useParams<{ gameId: string }>();
  const router = useRouter();
  const { token, loading: authLoading } = useAuth();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (authLoading) return;
    if (!token) {
      router.replace("/login");
      return;
    }
    let active = true;
    getGame(token, gameId)
      .then((detail) => {
        if (!active) return;
        const first = detail?.logs[0];
        router.replace(first ? `/kifu/${gameId}/${first.id}` : "/kifu");
      })
      .catch(() => {
        if (active) setError("取得に失敗しました");
      });
    return () => {
      active = false;
    };
  }, [authLoading, token, gameId, router]);

  return <p style={{ color: "#888", padding: 24 }}>{error ?? "開いています…"}</p>;
}
