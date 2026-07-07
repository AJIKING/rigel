"use client";

import { PROBLEM_KIND_LABELS } from "@rigel/ui";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { type ProblemPost } from "../../lib/api";
import { fmtDateSlash } from "../../lib/format";
import { useFavorites } from "../../lib/use-favorites";
import { AppHeader } from "../AppHeader";
import { GameCard } from "../GameCard";
import gc from "../game-card.module.css";
import s from "../list/kifu-list.module.css";

/** 何切る問題の公開一覧（published のみ）。牌譜一覧（/explore）と同じカードUI・ツールバー。 */
export function ProblemListScreen({ posts }: { posts: ProblemPost[] }) {
  const router = useRouter();
  const { favs, toggle: toggleFav } = useFavorites();
  const [q, setQ] = useState("");
  const [sort, setSort] = useState<"new" | "old">("new");

  const view = useMemo(() => {
    let arr = posts.slice();
    if (q) arr = arr.filter((p) => p.title.includes(q));
    arr.sort((a, b) => {
      const cmp = a.createdAt.localeCompare(b.createdAt);
      return sort === "old" ? cmp : -cmp;
    });
    return arr;
  }, [posts, q, sort]);

  return (
    <div className={`${s.shell} themeApp`}>
      <AppHeader active="problems" />
      <main className={s.main}>
        <section>
          <div className={s.pubhead}>
            <h1>何切る</h1>
            <p>みんなが出題した一打の判断を解く</p>
          </div>
          <div className={s.toolbar}>
            <div className={s.search}>
              <svg viewBox="0 0 24 24">
                <circle cx="11" cy="11" r="7" />
                <path d="M21 21l-4-4" />
              </svg>
              <input
                type="search"
                placeholder="問題を検索"
                aria-label="何切る問題を検索"
                value={q}
                onChange={(e) => setQ(e.target.value.trim())}
              />
            </div>
            <div className={s.sortwrap}>
              <select
                aria-label="並び替え"
                value={sort}
                onChange={(e) => setSort(e.target.value as typeof sort)}
              >
                <option value="new">新着</option>
                <option value="old">古い順</option>
              </select>
            </div>
            {/* 新規作成・マイ何切るへの導線はここには置かない（ヘッダのマイページから）。 */}
          </div>
          <div className={gc.feed}>
            {view.length === 0 ? (
              <div className={gc.empty}>まだ公開された問題がありません</div>
            ) : (
              view.map((p) => (
                <GameCard
                  key={p.id}
                  title={p.title || "（無題の問題）"}
                  badge={
                    <span className={`${gc.badge} ${gc.pub}`}>
                      {PROBLEM_KIND_LABELS[p.problem.kind]}
                    </span>
                  }
                  meta={fmtDateSlash(p.createdAt)}
                  faved={favs.has(p.id)}
                  onToggleFav={() => toggleFav(p.id)}
                  onOpen={() => router.push(`/p/${p.id}`)}
                />
              ))
            )}
          </div>
        </section>
      </main>
    </div>
  );
}
