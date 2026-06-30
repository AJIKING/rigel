"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { AddKyokuModal } from "../../../components/board/AddKyokuModal";
import { useAuth } from "../../../lib/auth-context";
import s from "../../../components/board/board-editor.module.css";

/** 新しい半荘の起点。盤面エディタ相当の暗い下地に「局を追加」ダイアログを最初から開く。
 *  AI/手動どちらかで最初の局を作ったら、その局のエディタへ置き換え遷移する。 */
export default function NewGamePage() {
  const { token, loading } = useAuth();
  const router = useRouter();

  // 撮影・作成には要ログイン。
  useEffect(() => {
    if (!loading && !token) router.replace("/login");
  }, [loading, token, router]);

  if (loading || !token) return null;

  return (
    <div className={`${s.app} themeBoard`}>
      <AddKyokuModal
        token={token}
        onClose={() => router.push("/kifu")}
        onDone={(logId, gameId) => router.replace(`/kifu/${gameId}/${logId}`)}
      />
    </div>
  );
}
