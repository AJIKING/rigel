"use client";

import { LIST_LOAD_ERROR_MESSAGE, planKifuLimits, sortMyList, type MyListSortKey } from "@rigel/ui";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { getMyGamesAction } from "../../app/actions";
import { type MyGameCard } from "../../lib/api";
import { useAuth } from "../../lib/auth-context";
import { fmtDateSlash } from "../../lib/format";
import { useFavorites } from "../../lib/use-favorites";
import { AppHeader } from "../AppHeader";
import { GameCard } from "../GameCard";
import { MyPageTabs } from "../mypage/MyPageTabs";
import { MyListToolbar } from "./MyListToolbar";
import gc from "../game-card.module.css";
import s from "./kifu-list.module.css";

/** 公開状態フィルタ（お気に入りは独立トグルなのでここには入れない）。 */
const STATUS_OPTIONS = [
  { value: "all", label: "すべて" },
  { value: "pub", label: "公開" },
  { value: "priv", label: "非公開" },
] as const;

/**
 * マイページの牌譜タブ（/mypage・要ログイン・noindex）。
 *
 * 公開一覧（PublicKifuScreen）とは見せるものも操作も違うので分けている
 * （[決定] 2026-07-26。以前は1つの component が view prop で2画面を兼ねていた）。
 * こちらは検索エンジンに出さないので、取得はクライアントのままでよい
 * （未ログインでもログイン導線を出して画面を成立させたいため）。
 */
export function MyKifuScreen() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();

  const [games, setGames] = useState<MyGameCard[] | null>(null);
  // 取得失敗を「0件」に化けさせない（空状態の案内を出すと通信失敗に気づけない）。
  const [loadFailed, setLoadFailed] = useState(false);

  // お気に入りはサーバー保存。カードが持つ viewerFaved/favoriteCount に、この画面での操作を重ねる。
  const { apply, toggle: toggleFav, error: favError } = useFavorites();
  const [status, setStatus] = useState<string>("all");
  const [sort, setSort] = useState<MyListSortKey>("new");
  const [favOnly, setFavOnly] = useState(false);
  const [q, setQ] = useState("");

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      setGames([]);
      return;
    }
    getMyGamesAction()
      .then(setGames)
      .catch(() => {
        setGames([]);
        setLoadFailed(true);
      });
  }, [authLoading, user]);

  const view = useMemo(() => {
    let arr = apply(games ?? []);
    if (favOnly) arr = arr.filter((c) => c.viewerFaved);
    if (status === "pub") arr = arr.filter((c) => c.publicCount > 0);
    else if (status === "priv") arr = arr.filter((c) => c.publicCount === 0);
    if (q) arr = arr.filter((c) => c.title.includes(q));
    return sortMyList(arr, sort);
  }, [games, status, sort, favOnly, q, apply]);

  // 保存上限（半荘単位）の使用数。非公開(complete)と下書きは別枠（mobile と同じ算出）。
  const limits = planKifuLimits(user?.plan ?? "free");
  const draftUsed = (games ?? []).filter((c) => c.draftCount > 0).length;
  const privateUsed = (games ?? []).filter(
    (c) => c.kyokuCount - c.publicCount - c.draftCount > 0,
  ).length;
  const quotaText = (used: number, limit: number | null) =>
    limit === null ? `${used}（無制限）` : `${used} / ${limit}半荘`;

  return (
    <div className={`${s.shell} themeApp`}>
      <AppHeader active="mypage" />
      <main className={s.main}>
        <section>
          <MyPageTabs active="kifu" />
          <div className={s.profile}>
            <div className={s.stats}>
              <div className={s.stat}>
                <b>{games?.length ?? 0}</b>
                <span>牌譜</span>
              </div>
              <div className={s.stat}>
                <b>{(games ?? []).filter((c) => c.publicCount > 0).length}</b>
                <span>公開</span>
              </div>
              <div className={s.stat}>
                <b>{(games ?? []).reduce((n, c) => n + c.favoriteCount, 0)}</b>
                <span>お気に入りされた数</span>
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

          {favError && <p className={s.favError}>{favError}</p>}

          <MyListToolbar
            q={q}
            onQ={setQ}
            searchLabel="自分の牌譜を検索"
            searchPlaceholder="牌譜を検索"
            statusLabel="公開状態で絞り込み"
            statusOptions={STATUS_OPTIONS}
            status={status}
            onStatus={setStatus}
            sort={sort}
            onSort={setSort}
            favOnly={favOnly}
            onFavOnly={setFavOnly}
            onNew={() => router.push("/kifu/new")}
          />

          <div className={gc.feed}>
            {!user ? (
              <p className={s.loginNote}>
                自分の牌譜を見るには <Link href="/login">サインイン</Link> してください。
              </p>
            ) : games === null ? (
              <div className={gc.empty}>読み込み中…</div>
            ) : view.length === 0 ? (
              <div className={gc.empty} role={loadFailed ? "alert" : undefined}>
                {loadFailed
                  ? LIST_LOAD_ERROR_MESSAGE
                  : favOnly
                    ? "お気に入りした牌譜はまだありません"
                    : "該当する牌譜がありません"}
              </div>
            ) : (
              view.map((c) => (
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
                  faved={c.viewerFaved}
                  favCount={c.favoriteCount}
                  onToggleFav={() => toggleFav("game", c)}
                  onOpen={() => router.push(`/kifu/${c.id}`)}
                />
              ))
            )}
          </div>
        </section>
      </main>
    </div>
  );
}
