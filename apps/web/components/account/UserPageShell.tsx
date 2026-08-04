"use client";

import { LIST_LOAD_ERROR_MESSAGE } from "@rigel/ui";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { getPublicProfile, type PublicProfile } from "../../lib/api";
import { fmtDateSlash } from "../../lib/format";
import { useFavorites } from "../../lib/use-favorites";
import { useLoadMore } from "../../lib/use-load-more";
import { AppHeader } from "../AppHeader";
import { GameCard } from "../GameCard";
import { LoadMoreButton } from "../list/LoadMoreButton";
import gc from "../game-card.module.css";
import s from "./account.module.css";

/** 別ユーザーの公開プロフィール（handle か id）と公開牌譜（カーソル方式の1ページ＋もっと見る）。 */
export function UserPageShell({ idOrHandle }: { idOrHandle: string }) {
  const router = useRouter();
  const [profile, setProfile] = useState<PublicProfile | null>(null);
  const [state, setState] = useState<"loading" | "ok" | "notfound" | "error">("loading");
  const { apply, toggle: toggleFav } = useFavorites();

  // 追加読み込みの機構（ガード込み）は useLoadMore（全一覧共通）。
  // 対象消失（null）は失敗として見せる（無反応ボタンにしない）。
  const { nextCursor, loadingMore, moreFailed, loadMore, reset } = useLoadMore(
    (cursor) => getPublicProfile(idOrHandle, cursor),
    (next) =>
      setProfile((prev) =>
        prev
          ? { ...prev, games: [...prev.games, ...next.games], nextCursor: next.nextCursor }
          : prev,
      ),
  );

  useEffect(() => {
    getPublicProfile(idOrHandle)
      .then((p) => {
        setProfile(p);
        setState(p ? "ok" : "notfound");
        // 別プロフィールへの遷移で reset（in-flight の追記は破棄＝前の人の半荘を混ぜない）。
        reset(p?.nextCursor ?? null);
      })
      // 通信失敗を「不在（非公開）」に化けさせない（実在ユーザーが非公開と誤解される）。
      .catch(() => setState("error"));
  }, [idOrHandle, reset]);

  return (
    <div className={`${s.shell} themeApp`}>
      <AppHeader active="kifu" />
      <main className={s.main}>
        <div className={s.wide}>
          {state === "loading" ? (
            <p style={{ color: "#888", padding: "40px 4px" }}>読み込み中…</p>
          ) : state === "error" ? (
            <p className={s.loginNote} role="alert">
              {LIST_LOAD_ERROR_MESSAGE}
            </p>
          ) : state === "notfound" || !profile ? (
            <p className={s.loginNote}>このユーザーは見つからないか、非公開です。</p>
          ) : (
            <>
              <div className={s.uhead}>
                <div className={s.uname}>
                  {profile.displayName || profile.handle || "名無しユーザー"}
                </div>
                <div className={s.uhandle}>@{profile.handle ?? profile.id.slice(0, 6)}</div>
              </div>
              <div className={s.usec}>公開牌譜</div>
              <div className={gc.feed}>
                {profile.games.length === 0 ? (
                  <div className={gc.empty}>公開されている牌譜がまだありません</div>
                ) : (
                  // ★は画面での操作を重ねてから描く（押した直後に見た目と件数が合う）。
                  apply(profile.games).map((g) => (
                    <GameCard
                      key={g.id}
                      title={g.title || "（無題の半荘）"}
                      meta={
                        <>
                          {fmtDateSlash(g.createdAt)}
                          <span className={gc.sep}>·</span>
                          {g.kyokuCount}局
                        </>
                      }
                      faved={g.viewerFaved}
                      favCount={g.favoriteCount}
                      onToggleFav={() => toggleFav("game", g)}
                      onOpen={() => router.push(`/k/${g.id}`)}
                    />
                  ))
                )}
              </div>
              <LoadMoreButton
                nextCursor={nextCursor}
                loadingMore={loadingMore}
                moreFailed={moreFailed}
                onLoadMore={() => void loadMore()}
              />
            </>
          )}
        </div>
      </main>
    </div>
  );
}
