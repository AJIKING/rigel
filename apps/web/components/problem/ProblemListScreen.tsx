"use client";

import {
  filterPublicFeed,
  PROBLEM_KIND_LABELS,
  PUBLIC_FEED_FILTERS,
  type FeedFilterKey,
} from "@rigel/ui";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { type ProblemPost } from "../../lib/api";
import { fmtDateSlash } from "../../lib/format";
import { useFavorites } from "../../lib/use-favorites";
import { AppHeader } from "../AppHeader";
import { GameCard } from "../GameCard";
import { ProblemThumb } from "./ProblemThumb";
import gc from "../game-card.module.css";
import s from "../list/kifu-list.module.css";

/** 何切る問題の公開一覧（published のみ）。牌譜一覧（/kifu）と同じカードUI・ツールバー・
 *  絞り込み（新着/今週/お気に入り。選択肢は @rigel/ui で mobile とも共通）。 */
export function ProblemListScreen({ posts }: { posts: ProblemPost[] }) {
  const router = useRouter();
  const { favs, toggle: toggleFav } = useFavorites();
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<FeedFilterKey>("new");

  const view = useMemo(() => {
    const arr = q ? posts.filter((p) => p.title.includes(q)) : posts;
    return filterPublicFeed(arr, filter, favs);
  }, [posts, q, filter, favs]);

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
                value={filter}
                onChange={(e) => setFilter(e.target.value as FeedFilterKey)}
              >
                {PUBLIC_FEED_FILTERS.map((f) => (
                  <option key={f.key} value={f.key}>
                    {f.label}
                  </option>
                ))}
              </select>
            </div>
            {/* 新規作成・マイ何切るへの導線はここには置かない（ヘッダのマイページから）。 */}
          </div>
          <div className={gc.feed}>
            {view.length === 0 ? (
              <div className={gc.empty}>
                {filter === "fav"
                  ? "お気に入りした問題がまだありません"
                  : "まだ公開された問題がありません"}
              </div>
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
                  thumb={<ProblemThumb problem={p.problem} />}
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
