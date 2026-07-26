"use client";

import {
  filterPublicFeed,
  LIST_LOAD_ERROR_MESSAGE,
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
 *  絞り込み（新着/人気/今週/お気に入り。選択肢は @rigel/ui で mobile とも共通）。 */
export function ProblemListScreen({
  posts,
  loadFailed = false,
}: {
  posts: ProblemPost[];
  /** 取得に失敗した（0件ではない）。空状態の案内に化けさせないためのフラグ。 */
  loadFailed?: boolean;
}) {
  const router = useRouter();
  const { apply, toggle: toggleFav, error: favError } = useFavorites();
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<FeedFilterKey>("new");

  const view = useMemo(() => {
    const resolved = apply(posts);
    const arr = q ? resolved.filter((p) => p.title.includes(q)) : resolved;
    return filterPublicFeed(arr, filter);
  }, [posts, q, filter, apply]);

  return (
    <div className={`${s.shell} themeApp`}>
      <AppHeader active="problems" />
      <main className={s.main}>
        <section>
          <div className={s.pubhead}>
            <h1>何切る</h1>
            <p>みんなが出題した一打の判断を解く</p>
          </div>
          {favError && <p className={s.favError}>{favError}</p>}
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
              <div className={gc.empty} role={loadFailed ? "alert" : undefined}>
                {loadFailed
                  ? LIST_LOAD_ERROR_MESSAGE
                  : filter === "fav"
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
                  faved={p.viewerFaved}
                  favCount={p.favoriteCount}
                  onToggleFav={() => toggleFav("problem", p)}
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
