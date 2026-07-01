"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { AddKyokuModal } from "../../../components/board/AddKyokuModal";
import { useAuth } from "../../../lib/auth-context";
import s from "../../../components/board/board-editor.module.css";

/** 新しい半荘の起点。盤面エディタ相当の暗い下地に「局を追加」ダイアログを最初から開く。
 *  AI/手動どちらかで最初の局を作ったら、その局のエディタへ置き換え遷移する。 */
export default function NewGamePage() {
  const { user, loading } = useAuth();
  const router = useRouter();

  // 撮影・作成には要ログイン。セッションは Cookie にあるので user の有無で判定する。
  useEffect(() => {
    if (!loading && !user) router.replace("/login");
  }, [loading, user, router]);

  if (loading || !user) return null;

  return (
    <div className={`${s.app} themeBoard`}>
      <AddKyokuModal
        onClose={() => router.push("/kifu")}
        onDone={(logId, gameId) => router.replace(`/kifu/${gameId}/${logId}`)}
      />
    </div>
  );
}
