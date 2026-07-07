"use client";

import { authorLabel, planKifuLimits } from "@rigel/ui";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { getMyGamesAction } from "../../app/actions";
import { getPublicGames, type MyGameCard, type PublicGameCard } from "../../lib/api";
import { useAuth } from "../../lib/auth-context";
import { fmtDateSlash } from "../../lib/format";
import { useFavorites } from "../../lib/use-favorites";
import { AppHeader } from "../AppHeader";
import { GameCard } from "../GameCard";
import { MyPageTabs } from "../mypage/MyPageTabs";
import gc from "../game-card.module.css";
import s from "./kifu-list.module.css";

/** 牌譜一覧。view=mine はマイページの牌譜タブ(/mypage・要ログイン)、view=public は公開牌譜(/kifu)。 */
export function KifuListShell({ view }: { view: "mine" | "public" }) {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();

  const [mine, setMine] = useState<MyGameCard[] | null>(null);
  const [pub, setPub] = useState<PublicGameCard[] | null>(null);

  const { favs, toggle: toggleFav } = useFavorites();
  const [mineStatus, setMineStatus] = useState<"all" | "pub" | "priv" | "fav">("all");
  const [mineSort, setMineSort] = useState<"new" | "old" | "kyoku">("new");
  const [mineQ, setMineQ] = useState("");
  const [pubSort, setPubSort] = useState<"new" | "kyoku">("new");
  const [pubQ, setPubQ] = useState("");

  useEffect(() => {
    if (view !== "public") return;
    getPublicGames()
      .then(setPub)
      .catch(() => setPub([]));
  }, [view]);
  useEffect(() => {
    if (view !== "mine" || authLoading) return;
    if (!user) {
      setMine([]);
      return;
    }
    getMyGamesAction()
      .then(setMine)
      .catch(() => setMine([]));
  }, [view, authLoading, user]);

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

  // 保存上限（半荘単位）の使用数。非公開(complete)と下書きは別枠（mobile と同じ算出）。
  const limits = planKifuLimits(user?.plan ?? "free");
  const draftUsed = (mine ?? []).filter((c) => c.draftCount > 0).length;
  const privateUsed = (mine ?? []).filter(
    (c) => c.kyokuCount - c.publicCount - c.draftCount > 0,
  ).length;
  const quotaText = (used: number, limit: number | null) =>
    limit === null ? `${used}（無制限）` : `${used} / ${limit}半荘`;

  const pubView = useMemo(() => {
    let arr = (pub ?? []).slice();
    if (pubQ)
      arr = arr.filter(
        (c) =>
          c.title.includes(pubQ) ||
          (c.ownerHandle ?? "").includes(pubQ) ||
          (c.ownerName ?? "").includes(pubQ),
      );
    arr.sort((a, b) =>
      pubSort === "kyoku" ? b.kyokuCount - a.kyokuCount : -a.createdAt.localeCompare(b.createdAt),
    );
    return arr;
  }, [pub, pubSort, pubQ]);

  return (
    <div className={`${s.shell} themeApp`}>
      <AppHeader active={view === "mine" ? "mypage" : "kifu"} />

      <main className={s.main}>
        {view === "mine" ? (
          <section>
            <MyPageTabs active="kifu" />
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
              {/* 作成可能数と現在数（半荘単位。free=各5 / 有料=無制限）。mobile と同一表示。 */}
              {user ? (
                <p className={s.quota}>
                  非公開 {quotaText(privateUsed, limits.private)}
                  <span className={gc.sep}>·</span>
                  下書き {quotaText(draftUsed, limits.draft)}
                </p>
              ) : null}
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
              <button className={s.newbtn} onClick={() => router.push("/kifu/new")}>
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

            <div className={gc.feed}>
              {!user ? (
                <p className={s.loginNote}>
                  自分の牌譜を見るには <Link href="/login">ログイン</Link> してください。
                </p>
              ) : mine === null ? (
                <div className={gc.empty}>読み込み中…</div>
              ) : mineView.length === 0 ? (
                <div className={gc.empty}>
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
                      <>
                        {c.publicCount > 0 ? (
                          <span className={`${gc.badge} ${gc.pub}`}>公開</span>
                        ) : (
                          <span className={`${gc.badge} ${gc.priv}`}>非公開</span>
                        )}
                        {/* 下書きが1局でもあれば注意色、無ければ編集済（mobile と同一表示）。 */}
                        {c.draftCount > 0 ? (
                          <span className={`${gc.badge} ${gc.draft}`}>下書き</span>
                        ) : (
                          <span className={`${gc.badge} ${gc.priv}`}>編集済</span>
                        )}
                      </>
                    }
                    meta={
                      <>
                        {fmtDateSlash(c.createdAt)}
                        <span className={gc.sep}>·</span>
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
              <h1>牌譜</h1>
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
            <div className={gc.feed}>
              {pub === null ? (
                <div className={gc.empty}>読み込み中…</div>
              ) : pubView.length === 0 ? (
                <div className={gc.empty}>公開されている牌譜がまだありません</div>
              ) : (
                pubView.map((c) => (
                  <GameCard
                    key={c.id}
                    title={c.title || "（無題の半荘）"}
                    meta={
                      <>
                        {c.ownerHandle || c.ownerName ? (
                          <span
                            className={gc.au}
                            role="link"
                            tabIndex={0}
                            style={{ cursor: "pointer" }}
                            onClick={(e) => {
                              e.stopPropagation();
                              router.push(`/u/${c.ownerHandle ?? c.ownerId}`);
                            }}
                          >
                            {authorLabel({ handle: c.ownerHandle, name: c.ownerName })}
                          </span>
                        ) : (
                          <span className={gc.au}>名無し</span>
                        )}
                        <span className={gc.sep}>·</span>
                        {fmtDateSlash(c.createdAt)}
                        <span className={gc.sep}>·</span>
                        {c.kyokuCount}局
                      </>
                    }
                    faved={favs.has(c.id)}
                    onToggleFav={() => toggleFav(c.id)}
                    onOpen={() => router.push(`/k/${c.id}`)}
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
