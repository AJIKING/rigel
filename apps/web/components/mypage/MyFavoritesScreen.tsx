"use client";

import type { FavoriteGameCard, FavoriteProblemCard } from "@rigel/client";
import {
  authorLabel,
  sortMyList,
  A11Y_LABELS,
  LIST_LOAD_ERROR_MESSAGE,
  PROBLEM_KIND_LABELS,
  type MyListSortKey,
} from "@rigel/ui";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { fmtDateSlash } from "../../lib/format";
import { useFavorites } from "../../lib/use-favorites";
import { AppHeader } from "../AppHeader";
import { GameCard } from "../GameCard";
import { MyListToolbar } from "../list/MyListToolbar";
import { ProblemThumb } from "../problem/ProblemThumb";
import { MyPageTabs } from "./MyPageTabs";
import gc from "../game-card.module.css";
import s from "../list/kifu-list.module.css";

/** 種別の絞り込み（牌譜タブ・何切るタブの「状態」と同じ位置・同じ形）。 */
const KIND_OPTIONS = [
  { value: "all", label: "すべて" },
  { value: "game", label: "牌譜" },
  { value: "problem", label: "何切る" },
] as const;

/**
 * マイページ「お気に入り」タブ。**自分が付けた★を、牌譜と何切るをまたいで1か所で見る**
 * （[決定] 2026-07-26。それまでは自分の投稿の中でしか絞り込めず、他人の投稿に付けた★は
 * どこからも辿れなかった）。ツールバーの並びは他タブと共通（検索・絞り込み・並び替え）。
 *
 * 非公開に戻された・削除された対象はサーバー側で落ちるので、ここには出てこない。
 */
export function MyFavoritesScreen({
  initialGames,
  initialProblems,
  loadFailed = false,
}: {
  initialGames: FavoriteGameCard[];
  initialProblems: FavoriteProblemCard[];
  /** 取得に失敗した（0件ではない）。空状態の案内に化けさせないためのフラグ。 */
  loadFailed?: boolean;
}) {
  const router = useRouter();
  const { apply, toggle: toggleFav, error: favError } = useFavorites();
  const [q, setQ] = useState("");
  const [kind, setKind] = useState<string>("all");
  const [sort, setSort] = useState<MyListSortKey>("new");

  // このタブは常に「お気に入りのみ」（★を外したものはその場で消す）。トグルは出さない
  // （[決定] 2026-07-29。全部お気に入りなので無意味。mobile と統一）。
  const games = useMemo(() => {
    if (kind === "problem") return [];
    let arr = apply(initialGames).filter((g) => g.viewerFaved);
    if (q) arr = arr.filter((g) => g.title.includes(q));
    return sortMyList(arr, sort);
  }, [initialGames, kind, q, sort, apply]);

  const problems = useMemo(() => {
    if (kind === "game") return [];
    let arr = apply(initialProblems).filter((p) => p.viewerFaved);
    if (q) arr = arr.filter((p) => p.title.includes(q));
    return sortMyList(arr, sort);
  }, [initialProblems, kind, q, sort, apply]);

  const empty = games.length === 0 && problems.length === 0;

  return (
    <div className={`${s.shell} themeApp`}>
      <AppHeader active="mypage" />
      <main className={s.main}>
        <section>
          <MyPageTabs active="favorites" />
          <div className={s.profile}>
            <div className={s.stats}>
              <div className={s.stat}>
                <b>{initialGames.length + initialProblems.length}</b>
                <span>お気に入り</span>
              </div>
              <div className={s.stat}>
                <b>{initialGames.length}</b>
                <span>牌譜</span>
              </div>
              <div className={s.stat}>
                <b>{initialProblems.length}</b>
                <span>何切る</span>
              </div>
            </div>
          </div>

          {favError && <p className={s.favError}>{favError}</p>}

          <MyListToolbar
            q={q}
            onQ={setQ}
            searchLabel={A11Y_LABELS.searchFavorites}
            searchPlaceholder="お気に入りを検索"
            statusLabel={A11Y_LABELS.filterFavoriteKind}
            statusOptions={KIND_OPTIONS}
            status={kind}
            onStatus={setKind}
            sort={sort}
            onSort={setSort}
          />

          <div className={gc.feed}>
            {empty ? (
              <div className={gc.empty} role={loadFailed ? "alert" : undefined}>
                {loadFailed
                  ? LIST_LOAD_ERROR_MESSAGE
                  : initialGames.length + initialProblems.length === 0
                    ? "まだお気に入りがありません。牌譜や何切るのカードの★から追加できます"
                    : "該当するお気に入りがありません"}
              </div>
            ) : (
              <>
                {games.map((g) => (
                  <GameCard
                    key={`g-${g.id}`}
                    title={g.title || "（無題の半荘）"}
                    badge={<span className={`${gc.badge} ${gc.priv}`}>牌譜</span>}
                    meta={
                      <>
                        {g.mine ? (
                          <span className={gc.au}>自分</span>
                        ) : g.ownerHandle || g.ownerName ? (
                          <Link
                            href={`/u/${g.ownerHandle ?? g.ownerId}`}
                            className={gc.au}
                            onClick={(e) => e.stopPropagation()}
                          >
                            {authorLabel({ handle: g.ownerHandle, name: g.ownerName })}
                          </Link>
                        ) : (
                          <span className={gc.au}>名無し</span>
                        )}
                        <span className={gc.sep}>·</span>
                        {fmtDateSlash(g.createdAt)}
                        <span className={gc.sep}>·</span>
                        {g.kyokuCount}局
                      </>
                    }
                    faved={g.viewerFaved}
                    favCount={g.favoriteCount}
                    onToggleFav={() => toggleFav("game", g)}
                    // 自分の半荘は編集画面、他人の半荘は公開ビューアへ。
                    onOpen={() => router.push(g.mine ? `/kifu/${g.id}` : `/k/${g.id}`)}
                  />
                ))}
                {problems.map((p) => (
                  <GameCard
                    key={`p-${p.id}`}
                    title={p.title || "（無題の問題）"}
                    badge={
                      <span className={`${gc.badge} ${gc.priv}`}>
                        {PROBLEM_KIND_LABELS[p.problem.kind]}
                      </span>
                    }
                    thumb={<ProblemThumb problem={p.problem} />}
                    meta={
                      <>
                        {p.mine ? (
                          <span className={gc.au}>自分</span>
                        ) : p.ownerHandle || p.ownerName ? (
                          <Link
                            href={`/u/${p.ownerHandle ?? p.userId}`}
                            className={gc.au}
                            onClick={(e) => e.stopPropagation()}
                          >
                            {authorLabel({ handle: p.ownerHandle, name: p.ownerName })}
                          </Link>
                        ) : (
                          <span className={gc.au}>名無し</span>
                        )}
                        <span className={gc.sep}>·</span>
                        {fmtDateSlash(p.createdAt)}
                      </>
                    }
                    faved={p.viewerFaved}
                    favCount={p.favoriteCount}
                    onToggleFav={() => toggleFav("problem", p)}
                    onOpen={() => router.push(`/p/${p.id}`)}
                  />
                ))}
              </>
            )}
          </div>
        </section>
      </main>
    </div>
  );
}
