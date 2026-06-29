"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { getPublicProfile, type PublicProfile } from "../../lib/api";
import s from "./account.module.css";

const FAV_KEY = "rigel.favs";

function fmtDate(iso: string): string {
  return iso.slice(0, 10).replace(/-/g, "/");
}

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
  const [favs, setFavs] = useState<Set<string>>(new Set());

  useEffect(() => {
    try {
      const raw = localStorage.getItem(FAV_KEY);
      if (raw) setFavs(new Set(JSON.parse(raw) as string[]));
    } catch {
      /* noop */
    }
  }, []);
  const toggleFav = useCallback((id: string) => {
    setFavs((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      try {
        localStorage.setItem(FAV_KEY, JSON.stringify([...next]));
      } catch {
        /* noop */
      }
      return next;
    });
  }, []);

  useEffect(() => {
    getPublicProfile(idOrHandle)
      .then((p) => {
        setProfile(p);
        setState(p ? "ok" : "notfound");
      })
      .catch(() => setState("notfound"));
  }, [idOrHandle]);

  return (
    <div className={s.shell}>
      <main className={s.main}>
        <Link href="/kifu" className={s.backlink}>
          ← 牌譜一覧へ
        </Link>
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
                      onClick={() => router.push(`/kifu/${g.id}`)}
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
                        {fmtDate(g.createdAt)}
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
