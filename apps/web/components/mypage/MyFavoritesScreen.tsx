"use client";

import type { FavoriteGameCard, FavoriteProblemCard } from "@rigel/client";
import { ProblemSchema } from "@rigel/schema";
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
import { getMyFavoritesAction } from "../../app/actions";
import { fmtDateSlash } from "../../lib/format";
import { useFavorites } from "../../lib/use-favorites";
import { useLoadMore } from "../../lib/use-load-more";
import { AppHeader } from "../AppHeader";
import { GameCard } from "../GameCard";
import { LoadMoreButton } from "../list/LoadMoreButton";
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
  initialCursor,
  loadFailed = false,
}: {
  initialGames: FavoriteGameCard[];
  initialProblems: FavoriteProblemCard[];
  /** 次ページのカーソル（null=これで全部）。 */
  initialCursor: string | null;
  /** 取得に失敗した（0件ではない）。空状態の案内に化けさせないためのフラグ。 */
  loadFailed?: boolean;
}) {
  const router = useRouter();
  const { apply, toggle: toggleFav, error: favError } = useFavorites();
  const [q, setQ] = useState("");
  const [kind, setKind] = useState<string>("all");
  const [sort, setSort] = useState<MyListSortKey>("new");
  // 追加読み込み（半荘/何切るは1本のページを振り分けた形で届く）。機構は useLoadMore（全一覧共通）。
  const [loadedGames, setLoadedGames] = useState(initialGames);
  const [loadedProblems, setLoadedProblems] = useState(initialProblems);
  const { nextCursor, loadingMore, moreFailed, loadMore } = useLoadMore(
    getMyFavoritesAction,
    (page) => {
      setLoadedGames((prev) => [...prev, ...page.games]);
      // 信頼ゲート: 検証を通っていない問題データを画面へ流さない（初回ページと同じ。
      // 壊れた1件はスキップして全体を落とさない）。
      setLoadedProblems((prev) => [
        ...prev,
        ...page.problems.flatMap((p) => {
          const parsed = ProblemSchema.safeParse(p.problem);
          return parsed.success ? [{ ...p, problem: parsed.data }] : [];
        }),
      ]);
    },
    initialCursor,
  );

  // このタブは常に「お気に入りのみ」（★を外したものはその場で消す）。トグルは出さない
  // （[決定] 2026-07-29。全部お気に入りなので無意味。mobile と統一）。
  const games = useMemo(() => {
    if (kind === "problem") return [];
    let arr = apply(loadedGames).filter((g) => g.viewerFaved);
    if (q) arr = arr.filter((g) => g.title.includes(q));
    return sortMyList(arr, sort);
  }, [loadedGames, kind, q, sort, apply]);

  const problems = useMemo(() => {
    if (kind === "game") return [];
    let arr = apply(loadedProblems).filter((p) => p.viewerFaved);
    if (q) arr = arr.filter((p) => p.title.includes(q));
    return sortMyList(arr, sort);
  }, [loadedProblems, kind, q, sort, apply]);

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
                <b>{loadedGames.length + loadedProblems.length}</b>
                <span>お気に入り</span>
              </div>
              <div className={s.stat}>
                <b>{loadedGames.length}</b>
                <span>牌譜</span>
              </div>
              <div className={s.stat}>
                <b>{loadedProblems.length}</b>
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
                  : loadedGames.length + loadedProblems.length === 0
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
          <LoadMoreButton
            nextCursor={nextCursor}
            loadingMore={loadingMore}
            moreFailed={moreFailed}
            onLoadMore={() => void loadMore()}
          />
        </section>
      </main>
    </div>
  );
}
