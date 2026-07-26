"use client";

import {
  authorLabel,
  filterPublicFeed,
  LIST_LOAD_ERROR_MESSAGE,
  PUBLIC_FEED_FILTERS,
  type FeedFilterKey,
} from "@rigel/ui";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { type PublicGameCard } from "../../lib/api";
import { fmtDateSlash } from "../../lib/format";
import { useFavorites } from "../../lib/use-favorites";
import { AppHeader } from "../AppHeader";
import { GameCard } from "../GameCard";
import gc from "../game-card.module.css";
import s from "./kifu-list.module.css";

/**
 * 公開牌譜の一覧（/kifu・ログイン不要）。
 *
 * カードは**サーバーで描く**（[決定] 2026-07-26）: SEO 対象のページなので、
 * クライアント取得だと初回 HTML が空になりクローラに中身が届かない。
 * ここは絞り込み・検索・★の操作だけを担い、初期データは props で受け取る
 * （/problems と同じ形）。自分の牌譜は MyKifuScreen（要ログイン・noindex）。
 */
export function PublicKifuScreen({
  games,
  loadFailed = false,
}: {
  games: PublicGameCard[];
  /** 取得に失敗した（0件ではない）。空状態の案内に化けさせないためのフラグ。 */
  loadFailed?: boolean;
}) {
  const router = useRouter();
  // お気に入りはサーバー保存。カードが持つ viewerFaved/favoriteCount に、この画面での操作を重ねる。
  const { apply, toggle: toggleFav, error: favError } = useFavorites();
  // 絞り込みの選択肢と意味は @rigel/ui（mobile と同一）。
  const [filter, setFilter] = useState<FeedFilterKey>("new");
  const [q, setQ] = useState("");

  const view = useMemo(() => {
    let arr = apply(games);
    if (q)
      arr = arr.filter(
        (c) =>
          c.title.includes(q) ||
          (c.ownerHandle ?? "").includes(q) ||
          (c.ownerName ?? "").includes(q),
      );
    return filterPublicFeed(arr, filter);
  }, [games, filter, q, apply]);

  return (
    <div className={`${s.shell} themeApp`}>
      <AppHeader active="kifu" />
      <main className={s.main}>
        <section>
          <div className={s.pubhead}>
            <h1>牌譜</h1>
            <p>みんなが共有した卓の記録を見る</p>
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
                placeholder="タイトル・投稿者で検索"
                aria-label="公開牌譜を検索"
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
          </div>
          <div className={gc.feed}>
            {view.length === 0 ? (
              <div className={gc.empty} role={loadFailed ? "alert" : undefined}>
                {loadFailed
                  ? LIST_LOAD_ERROR_MESSAGE
                  : filter === "fav"
                    ? "お気に入りした牌譜がまだありません"
                    : "公開されている牌譜がまだありません"}
              </div>
            ) : (
              view.map((c) => (
                <GameCard
                  key={c.id}
                  title={c.title || "（無題の半荘）"}
                  meta={
                    <>
                      {c.ownerHandle || c.ownerName ? (
                        // 実アンカー（next/link）: Enter/Space で開ける。カードの onOpen へは伝播させない。
                        <Link
                          href={`/u/${c.ownerHandle ?? c.ownerId}`}
                          className={gc.au}
                          onClick={(e) => e.stopPropagation()}
                        >
                          {authorLabel({ handle: c.ownerHandle, name: c.ownerName })}
                        </Link>
                      ) : (
                        <span className={gc.au}>名無し</span>
                      )}
                      <span className={gc.sep}>·</span>
                      {fmtDateSlash(c.createdAt)}
                      <span className={gc.sep}>·</span>
                      {c.kyokuCount}局
                    </>
                  }
                  faved={c.viewerFaved}
                  favCount={c.favoriteCount}
                  onToggleFav={() => toggleFav("game", c)}
                  onOpen={() => router.push(`/k/${c.id}`)}
                />
              ))
            )}
          </div>
        </section>
      </main>
    </div>
  );
}
