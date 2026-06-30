"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { getPublicProfile, type PublicProfile } from "../../lib/api";
import { fmtDateSlash } from "../../lib/format";
import { useFavorites } from "../../lib/use-favorites";
import { AppHeader } from "../AppHeader";
import { GameCard } from "../GameCard";
import gc from "../game-card.module.css";
import s from "./account.module.css";

/** 別ユーザーの公開プロフィール（handle か id）と公開牌譜。 */
export function UserPageShell({ idOrHandle }: { idOrHandle: string }) {
  const router = useRouter();
  const [profile, setProfile] = useState<PublicProfile | null>(null);
  const [state, setState] = useState<"loading" | "ok" | "notfound">("loading");
  const { favs, toggle: toggleFav } = useFavorites();

  useEffect(() => {
    getPublicProfile(idOrHandle)
      .then((p) => {
        setProfile(p);
        setState(p ? "ok" : "notfound");
      })
      .catch(() => setState("notfound"));
  }, [idOrHandle]);

  return (
    <div className={`${s.shell} themeApp`}>
      <AppHeader active="public" />
      <main className={s.main}>
        <div className={s.wide}>
          {state === "loading" ? (
            <p style={{ color: "#888", padding: "40px 4px" }}>読み込み中…</p>
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
                  profile.games.map((g) => (
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
                      faved={favs.has(g.id)}
                      onToggleFav={() => toggleFav(g.id)}
                      onOpen={() => router.push(`/k/${g.id}`)}
                    />
                  ))
                )}
              </div>
            </>
          )}
        </div>
      </main>
    </div>
  );
}
