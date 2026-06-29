"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { getMyGames, getPublicGames, type MyGameCard, type PublicGameCard } from "../../lib/api";
import { useAuth } from "../../lib/auth-context";
import { fmtDateSlash } from "../../lib/format";
import { useFavorites } from "../../lib/use-favorites";
import s from "./kifu-list.module.css";

/** 卓チップのサムネ（純CSS）。 */
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

function FavButton({ on, onToggle }: { on: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      className={`${s.fav} ${on ? s.on : ""}`}
      aria-pressed={on}
      aria-label="お気に入り"
      onClick={(e) => {
        e.stopPropagation();
        onToggle();
      }}
    >
      <svg viewBox="0 0 24 24">
        <path d="M12 2.6l2.85 6.02 6.6.62-4.97 4.4 1.46 6.46L12 17.7 6.06 20.7l1.46-6.46-4.97-4.4 6.6-.62z" />
      </svg>
    </button>
  );
}

/** 一覧カード（マイページ・公開で共通）。meta は行内の説明、badge は任意。 */
function GameCard({
  title,
  badge,
  meta,
  faved,
  onToggleFav,
  onOpen,
}: {
  title: string;
  badge?: ReactNode;
  meta: ReactNode;
  faved: boolean;
  onToggleFav: () => void;
  onOpen: () => void;
}) {
  return (
    <button type="button" className={s.card} onClick={onOpen}>
      <FavButton on={faved} onToggle={onToggleFav} />
      <Thumb />
      <div className={s.ctop}>
        <h3 className={s.ctitle}>{title}</h3>
        {badge}
      </div>
      <div className={s.cmeta}>{meta}</div>
    </button>
  );
}

export function KifuListShell() {
  const { user, token, loading: authLoading } = useAuth();
  const router = useRouter();
  const [tab, setTab] = useState<"mine" | "public">("mine");

  const [mine, setMine] = useState<MyGameCard[] | null>(null);
  const [pub, setPub] = useState<PublicGameCard[] | null>(null);

  const { favs, toggle: toggleFav } = useFavorites();
  const [mineStatus, setMineStatus] = useState<"all" | "pub" | "priv" | "fav">("all");
  const [mineSort, setMineSort] = useState<"new" | "old" | "kyoku">("new");
  const [mineQ, setMineQ] = useState("");
  const [pubSort, setPubSort] = useState<"new" | "kyoku">("new");
  const [pubQ, setPubQ] = useState("");

  // 未ログインなら「公開牌譜」タブを既定にする（マイページは要ログインのため）。
  const autoTab = useRef(false);
  useEffect(() => {
    if (authLoading || autoTab.current) return;
    autoTab.current = true;
    if (!token) setTab("public");
  }, [authLoading, token]);

  useEffect(() => {
    getPublicGames()
      .then(setPub)
      .catch(() => setPub([]));
  }, []);
  useEffect(() => {
    if (authLoading) return;
    if (!token) {
      setMine([]);
      return;
    }
    getMyGames(token)
      .then(setMine)
      .catch(() => setMine([]));
  }, [authLoading, token]);

  const mineView = useMemo(() => {
    let arr = (mine ?? []).slice();
    if (mineStatus === "fav") arr = arr.filter((c) => favs.has(c.id));
    else if (mineStatus === "pub") arr = arr.filter((c) => c.publicCount > 0);
    else if (mineStatus === "priv") arr = arr.filter((c) => c.publicCount === 0);
    if (mineQ) arr = arr.filter((c) => c.title.includes(mineQ));
    arr.sort((a, b) => {
      if (mineSort === "kyoku") return b.kyokuCount - a.kyokuCount;
      const cmp = a.createdAt.localeCompare(b.createdAt);
      return mineSort === "old" ? cmp : -cmp;
    });
    return arr;
  }, [mine, mineStatus, mineSort, mineQ, favs]);

  const pubView = useMemo(() => {
    let arr = (pub ?? []).slice();
    if (pubQ) arr = arr.filter((c) => c.title.includes(pubQ) || c.ownerId.includes(pubQ));
    arr.sort((a, b) =>
      pubSort === "kyoku" ? b.kyokuCount - a.kyokuCount : -a.createdAt.localeCompare(b.createdAt),
    );
    return arr;
  }, [pub, pubSort, pubQ]);

  const avatarInitial = (user?.id ?? "私")[0]?.toUpperCase() ?? "私";

  return (
    <div className={s.shell}>
      <header className={s.header}>
        <span className={s.brand}>
          <svg viewBox="0 0 24 24" fill="none">
            <path
              d="M12 1.6l2.7 6.9 7.4.4-5.8 4.6 2 7.1L12 16.9 5.7 20.6l2-7.1L1.9 8.9l7.4-.4z"
              fill="#ff9e45"
            />
          </svg>
          <span className={s.brandName}>RIGEL</span>
        </span>
        <nav className={s.topnav}>
          <button className={tab === "mine" ? s.on : ""} onClick={() => setTab("mine")}>
            マイページ
          </button>
          <button className={tab === "public" ? s.on : ""} onClick={() => setTab("public")}>
            公開牌譜
          </button>
        </nav>
        <div className={s.spacer} />
        <button
          type="button"
          className={s.avatar}
          aria-label="設定"
          onClick={() => router.push("/settings")}
        >
          {avatarInitial}
        </button>
      </header>

      <main className={s.main}>
        {tab === "mine" ? (
          <section>
            <div className={s.profile}>
              <div className={s.stats}>
                <div className={s.stat}>
                  <b>{mine?.length ?? 0}</b>
                  <span>牌譜</span>
                </div>
                <div className={s.stat}>
                  <b>{(mine ?? []).filter((c) => c.publicCount > 0).length}</b>
                  <span>公開</span>
                </div>
                <div className={s.stat}>
                  <b>{(mine ?? []).reduce((n, c) => n + c.kyokuCount, 0)}</b>
                  <span>記録した局</span>
                </div>
              </div>
            </div>

            <div className={s.toolbar}>
              <div className={s.search}>
                <svg viewBox="0 0 24 24">
                  <circle cx="11" cy="11" r="7" />
                  <path d="M21 21l-4-4" />
                </svg>
                <input
                  type="search"
                  placeholder="牌譜を検索"
                  aria-label="自分の牌譜を検索"
                  value={mineQ}
                  onChange={(e) => setMineQ(e.target.value.trim())}
                />
              </div>
              <div className={s.sortwrap}>
                <select
                  aria-label="公開状態で絞り込み"
                  value={mineStatus}
                  onChange={(e) => setMineStatus(e.target.value as typeof mineStatus)}
                >
                  <option value="all">すべて</option>
                  <option value="pub">公開</option>
                  <option value="priv">非公開</option>
                  <option value="fav">お気に入り</option>
                </select>
              </div>
              <div className={s.sortwrap}>
                <select
                  aria-label="並び替え"
                  value={mineSort}
                  onChange={(e) => setMineSort(e.target.value as typeof mineSort)}
                >
                  <option value="new">新しい順</option>
                  <option value="old">古い順</option>
                  <option value="kyoku">局数が多い順</option>
                </select>
              </div>
              <button className={s.newbtn} onClick={() => router.push("/capture")}>
                <svg
                  viewBox="0 0 24 24"
                  width="14"
                  height="14"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.4"
                >
                  <path d="M12 5v14M5 12h14" />
                </svg>
                新規
              </button>
            </div>

            <div className={s.feed}>
              {!token ? (
                <p className={s.loginNote}>
                  自分の牌譜を見るには <Link href="/login">ログイン</Link> してください。
                </p>
              ) : mine === null ? (
                <div className={s.empty}>読み込み中…</div>
              ) : mineView.length === 0 ? (
                <div className={s.empty}>
                  {mineStatus === "fav"
                    ? "お気に入りした牌譜はまだありません"
                    : "該当する牌譜がありません"}
                </div>
              ) : (
                mineView.map((c) => (
                  <GameCard
                    key={c.id}
                    title={c.title || "（無題の半荘）"}
                    badge={
                      c.publicCount > 0 ? (
                        <span className={`${s.badge} ${s.pub}`}>公開</span>
                      ) : (
                        <span className={`${s.badge} ${s.priv}`}>非公開</span>
                      )
                    }
                    meta={
                      <>
                        {fmtDateSlash(c.createdAt)}
                        <span className={s.sep}>·</span>
                        {c.kyokuCount}局
                      </>
                    }
                    faved={favs.has(c.id)}
                    onToggleFav={() => toggleFav(c.id)}
                    onOpen={() => router.push(`/kifu/${c.id}`)}
                  />
                ))
              )}
            </div>
          </section>
        ) : (
          <section>
            <div className={s.pubhead}>
              <h1>公開牌譜</h1>
              <p>みんなが共有した卓の記録を見る</p>
            </div>
            <div className={s.toolbar}>
              <div className={s.search}>
                <svg viewBox="0 0 24 24">
                  <circle cx="11" cy="11" r="7" />
                  <path d="M21 21l-4-4" />
                </svg>
                <input
                  type="search"
                  placeholder="タイトル・投稿者で検索"
                  aria-label="公開牌譜を検索"
                  value={pubQ}
                  onChange={(e) => setPubQ(e.target.value.trim())}
                />
              </div>
              <div className={s.sortwrap}>
                <select
                  aria-label="並び替え"
                  value={pubSort}
                  onChange={(e) => setPubSort(e.target.value as typeof pubSort)}
                >
                  <option value="new">新着</option>
                  <option value="kyoku">局数が多い順</option>
                </select>
              </div>
            </div>
            <div className={s.feed}>
              {pub === null ? (
                <div className={s.empty}>読み込み中…</div>
              ) : pubView.length === 0 ? (
                <div className={s.empty}>公開されている牌譜がまだありません</div>
              ) : (
                pubView.map((c) => (
                  <GameCard
                    key={c.id}
                    title={c.title || "（無題の半荘）"}
                    meta={
                      <>
                        <span
                          className={s.au}
                          role="link"
                          tabIndex={0}
                          style={{ cursor: "pointer" }}
                          onClick={(e) => {
                            e.stopPropagation();
                            router.push(`/u/${c.ownerId}`);
                          }}
                        >
                          @{c.ownerId.slice(0, 6)}
                        </span>
                        <span className={s.sep}>·</span>
                        {fmtDateSlash(c.createdAt)}
                        <span className={s.sep}>·</span>
                        {c.kyokuCount}局
                      </>
                    }
                    faved={favs.has(c.id)}
                    onToggleFav={() => toggleFav(c.id)}
                    onOpen={() => router.push(`/k/${c.firstLogId}`)}
                  />
                ))
              )}
            </div>
          </section>
        )}
      </main>
    </div>
  );
}
