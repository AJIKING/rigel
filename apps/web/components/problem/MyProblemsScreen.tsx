"use client";

import {
  PROBLEM_KIND_LABELS,
  PROBLEM_LIMIT,
  LIMIT_MESSAGES,
  LIST_LOAD_ERROR_MESSAGE,
  sortMyList,
  type MyListSortKey,
} from "@rigel/ui";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { deleteProblemAction, updateProblemAction } from "../../app/actions";
import { type ProblemPost } from "../../lib/api";
import { useAuth } from "../../lib/auth-context";
import { fmtDateSlash } from "../../lib/format";
import { useFavorites } from "../../lib/use-favorites";
import { AppHeader } from "../AppHeader";
import { GameCard } from "../GameCard";
import { MyListToolbar } from "../list/MyListToolbar";
import { MyPageTabs } from "../mypage/MyPageTabs";
import { ProblemThumb } from "./ProblemThumb";
import gc from "../game-card.module.css";
import s from "../list/kifu-list.module.css";
import p9 from "./problem.module.css";

/** マイページ 何切るタブの状態フィルタ（牌譜タブと同じ形。お気に入りは独立トグル）。 */
const STATUS_OPTIONS = [
  { value: "all", label: "すべて" },
  { value: "published", label: "公開" },
  { value: "draft", label: "下書き" },
] as const;

/**
 * マイ何切る（自分の問題の管理）。牌譜のマイページ（/kifu）と同じ構造
 * （統計・クォータ・ツールバー・GameCard）。状態は draft / published の二択。
 * free は draft+published 合算 20 問まで。
 */
export function MyProblemsScreen({
  initialPosts,
  loadFailed = false,
}: {
  initialPosts: ProblemPost[];
  /** 取得に失敗した（0件ではない）。空状態の案内に化けさせないためのフラグ。 */
  loadFailed?: boolean;
}) {
  const { user } = useAuth();
  const router = useRouter();
  // お気に入りはサーバー保存。牌譜タブと同じ扱い（カードの値に画面の操作を重ねる）。
  const { apply, toggle: toggleFav, error: favError } = useFavorites();
  const [posts, setPosts] = useState(initialPosts);
  const [delArm, setDelArm] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<string>("all");
  const [sort, setSort] = useState<MyListSortKey>("new");
  const [favOnly, setFavOnly] = useState(false);

  const limit = PROBLEM_LIMIT[user?.plan ?? "free"];
  const atLimit = limit !== null && posts.length >= limit;
  const publishedCount = posts.filter((post) => post.status === "published").length;

  const view = useMemo(() => {
    let arr = apply(posts);
    if (favOnly) arr = arr.filter((post) => post.viewerFaved);
    if (status !== "all") arr = arr.filter((post) => post.status === status);
    if (q) arr = arr.filter((post) => post.title.includes(q));
    return sortMyList(arr, sort);
  }, [posts, status, sort, favOnly, q, apply]);

  /** draft⇔published の切替（楽観更新・失敗でロールバック）。 */
  async function toggleStatus(post: ProblemPost) {
    const next = post.status === "draft" ? "published" : "draft";
    setPosts((cur) => cur.map((x) => (x.id === post.id ? { ...x, status: next } : x)));
    const res = await updateProblemAction(post.id, { status: next }).catch(() => ({
      ok: false,
      status: 0,
    }));
    if (!res.ok) {
      setPosts((cur) => cur.map((x) => (x.id === post.id ? { ...x, status: post.status } : x)));
      setErr("状態の変更に失敗しました。");
    }
  }

  /** 削除（2度押しで確定＝誤操作防止）。 */
  async function onDelete(post: ProblemPost) {
    if (delArm !== post.id) {
      setDelArm(post.id);
      setTimeout(() => setDelArm((cur) => (cur === post.id ? null : cur)), 2500);
      return;
    }
    setDelArm(null);
    const res = await deleteProblemAction(post.id).catch(() => ({ ok: false, status: 0 }));
    if (res.ok) setPosts((cur) => cur.filter((x) => x.id !== post.id));
    else setErr("削除に失敗しました。");
  }

  return (
    <div className={`${s.shell} themeApp`}>
      <AppHeader active="mypage" />
      <main className={s.main}>
        <section>
          <MyPageTabs active="problems" />
          <div className={s.profile}>
            <div className={s.stats}>
              <div className={s.stat}>
                <b>{publishedCount}</b>
                <span>公開</span>
              </div>
              <div className={s.stat}>
                <b>{posts.length - publishedCount}</b>
                <span>下書き</span>
              </div>
              {/* 牌譜タブと同じ3枠構成に揃える（反響が一目で分かるように）。 */}
              <div className={s.stat}>
                <b>{posts.reduce((n, post) => n + post.favoriteCount, 0)}</b>
                <span>お気に入りされた数</span>
              </div>
            </div>
            {limit !== null && (
              <p className={s.quota}>
                何切る {posts.length} / {limit}問
              </p>
            )}
          </div>
          {atLimit && <p className={p9.limitNote}>{LIMIT_MESSAGES.problems}</p>}
          {err && <p className={p9.err}>{err}</p>}
          {favError && <p className={s.favError}>{favError}</p>}

          <MyListToolbar
            q={q}
            onQ={setQ}
            searchLabel="自分の問題を検索"
            searchPlaceholder="問題を検索"
            statusLabel="状態で絞り込み"
            statusOptions={STATUS_OPTIONS}
            status={status}
            onStatus={setStatus}
            sort={sort}
            onSort={setSort}
            favOnly={favOnly}
            onFavOnly={setFavOnly}
            onNew={() => router.push("/problems/new")}
            newDisabled={atLimit}
          />

          <div className={gc.feed}>
            {view.length === 0 ? (
              <div className={gc.empty} role={loadFailed ? "alert" : undefined}>
                {loadFailed
                  ? LIST_LOAD_ERROR_MESSAGE
                  : favOnly
                    ? "お気に入りした問題はまだありません"
                    : posts.length === 0
                      ? "まだ問題がありません。「＋ 新規」から作成できます"
                      : "該当する問題がありません"}
              </div>
            ) : (
              view.map((post) => (
                <GameCard
                  key={post.id}
                  title={post.title || "（無題の問題）"}
                  badge={
                    <>
                      <span className={`${gc.badge} ${gc.priv}`}>
                        {PROBLEM_KIND_LABELS[post.problem.kind]}
                      </span>
                      {post.status === "published" ? (
                        <span className={`${gc.badge} ${gc.pub}`}>公開</span>
                      ) : (
                        <span className={`${gc.badge} ${gc.draft}`}>下書き</span>
                      )}
                    </>
                  }
                  meta={fmtDateSlash(post.createdAt)}
                  thumb={<ProblemThumb problem={post.problem} />}
                  faved={post.viewerFaved}
                  favCount={post.favoriteCount}
                  onToggleFav={() => toggleFav("problem", post)}
                  onOpen={() => router.push(`/p/${post.id}`)}
                  actions={
                    <>
                      <button type="button" onClick={() => void toggleStatus(post)}>
                        {post.status === "draft" ? "公開する" : "下書きに戻す"}
                      </button>
                      <button
                        type="button"
                        onClick={() => router.push(`/problems/${post.id}/edit`)}
                      >
                        編集
                      </button>
                      <button
                        type="button"
                        className={gc.danger}
                        onClick={() => void onDelete(post)}
                      >
                        {delArm === post.id ? "もう一度押して削除" : "削除"}
                      </button>
                    </>
                  }
                />
              ))
            )}
          </div>
        </section>
      </main>
    </div>
  );
}
