"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { getPublicProfile, type PublicProfile } from "../../lib/api";
import { fmtDateSlash } from "../../lib/format";
import { useFavorites } from "../../lib/use-favorites";
import { AppHeader } from "../AppHeader";
import s from "./account.module.css";

function Thumb() {
  return (
    <div className={s.thumb}>
      <i className={`${s.h} ${s.tt}`} />
      <i className={`${s.h} ${s.bb}`} />
      <i className={`${s.v} ${s.ll}`} />
      <i className={`${s.v} ${s.rr}`} />
      <i className={s.dot} />
    </div>
  );
}

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
              <div className={s.feed}>
                {profile.games.length === 0 ? (
                  <div className={s.empty}>公開されている牌譜がまだありません</div>
                ) : (
                  profile.games.map((g) => (
                    <button
                      key={g.id}
                      type="button"
                      className={s.card}
                      onClick={() => router.push(`/k/${g.id}`)}
                    >
                      <button
                        type="button"
                        className={`${s.fav} ${favs.has(g.id) ? s.on : ""}`}
                        aria-pressed={favs.has(g.id)}
                        aria-label="お気に入り"
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleFav(g.id);
                        }}
                      >
                        <svg viewBox="0 0 24 24">
                          <path d="M12 2.6l2.85 6.02 6.6.62-4.97 4.4 1.46 6.46L12 17.7 6.06 20.7l1.46-6.46-4.97-4.4 6.6-.62z" />
                        </svg>
                      </button>
                      <Thumb />
                      <h3 className={s.ctitle}>{g.title || "（無題の半荘）"}</h3>
                      <div className={s.cmeta}>
                        {fmtDateSlash(g.createdAt)}
                        <span className={s.sep}>·</span>
                        {g.kyokuCount}局
                      </div>
                    </button>
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
