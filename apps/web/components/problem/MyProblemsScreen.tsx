"use client";

import {
  deleteConfirmText,
  filterMyProblems,
  sortMyList,
  A11Y_LABELS,
  DELETE_CONFIRM,
  PROBLEM_KIND_LABELS,
  PROBLEM_LIMIT,
  LIMIT_MESSAGES,
  LIST_LOAD_ERROR_MESSAGE,
  LIST_REFRESH_INTERVAL_MS,
  MY_PROBLEM_STATUS_OPTIONS,
  type MyListSortKey,
} from "@rigel/ui";
import type { ProblemDraftCard } from "@rigel/client";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import {
  deleteProblemAction,
  deleteProblemDraftAction,
  getProblemDraftsAction,
  updateProblemAction,
} from "../../app/actions";
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
  const [err, setErr] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<string>("all");
  const [sort, setSort] = useState<MyListSortKey>("new");
  const [favOnly, setFavOnly] = useState(false);

  const limit = PROBLEM_LIMIT[user?.plan ?? "free"];
  const atLimit = limit !== null && posts.length >= limit;
  const publishedCount = posts.filter((post) => post.status === "published").length;

  // 解析下書き（photo-retention.md）: 写真AI再現の送信で先行作成され、閉じてもここに残る。
  // 解析中のものがある間は 5 秒間隔で再取得（完了・失敗をユーザー操作なしで反映する）。
  const [drafts, setDrafts] = useState<ProblemDraftCard[]>([]);
  const hasProcessing = drafts.some((d) => d.status === "processing");
  useEffect(() => {
    if (!user) return;
    let alive = true;
    const load = () =>
      getProblemDraftsAction()
        .then((d) => {
          if (alive) setDrafts(d);
        })
        .catch(() => {
          // 取得失敗を「下書きなし」に化けさせない（牌譜一覧の loadFailed と同じ思想）。
          if (alive) setErr("解析下書きを読み込めませんでした。");
        });
    void load();
    const timer = hasProcessing ? setInterval(() => void load(), LIST_REFRESH_INTERVAL_MS) : null;
    return () => {
      alive = false;
      if (timer) clearInterval(timer);
    };
  }, [user, hasProcessing]);

  /** 解析下書きの破棄（写真ごと消える）。 */
  async function onDiscardDraft(id: string) {
    if (!window.confirm(deleteConfirmText(DELETE_CONFIRM.problemDraft))) return;
    const res = await deleteProblemDraftAction(id).catch(() => ({ ok: false, status: 0 }));
    if (res.ok) setDrafts((cur) => cur.filter((d) => d.id !== id));
    else setErr("下書きの破棄に失敗しました。");
  }

  // 絞り込みの述語は @rigel/ui（mobile と共通＝挙動の同一性をコピーで担保しない）。
  const view = useMemo(
    () => sortMyList(filterMyProblems(apply(posts), { q, status, favOnly }), sort),
    [posts, status, sort, favOnly, q, apply],
  );

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

  /** 削除（説明つき confirm。文言は web/mobile 共通の DELETE_CONFIRM）。 */
  async function onDelete(post: ProblemPost) {
    if (!window.confirm(deleteConfirmText(DELETE_CONFIRM.problem(post.title)))) return;
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
            searchLabel={A11Y_LABELS.searchMyProblems}
            searchPlaceholder="問題を検索"
            statusLabel={A11Y_LABELS.filterProblemStatus}
            statusOptions={MY_PROBLEM_STATUS_OPTIONS}
            status={status}
            onStatus={setStatus}
            sort={sort}
            onSort={setSort}
            favOnly={favOnly}
            onFavOnly={setFavOnly}
            onNew={() => router.push("/problems/new")}
            newDisabled={atLimit}
          />

          {/* 解析下書き（写真AI再現の受け皿）。通常の問題カードの上に出す。
              「下書き」バッジは通常問題の draft と紛れるので「解析完了」と呼び分ける。 */}
          {drafts.length > 0 && (
            <div className={gc.feed}>
              {drafts.map((d) => (
                <GameCard
                  key={d.id}
                  title="解析下書き"
                  badge={
                    d.status === "ready" ? (
                      <span className={`${gc.badge} ${gc.pub}`}>解析完了</span>
                    ) : d.status === "processing" ? (
                      <span className={`${gc.badge} ${gc.priv}`}>解析中</span>
                    ) : (
                      <span className={`${gc.badge} ${gc.fail}`}>解析失敗</span>
                    )
                  }
                  meta={fmtDateSlash(d.createdAt)}
                  onOpen={() => {
                    if (d.status === "ready") {
                      router.push(`/problems/new?draft=${d.id}`);
                    } else {
                      setErr(
                        d.status === "processing"
                          ? "解析中です。完了するとタップして編集できます。"
                          : "解析に失敗しました。不要であれば「破棄」してください。",
                      );
                    }
                  }}
                  actions={
                    <button
                      type="button"
                      className={gc.danger}
                      onClick={() => void onDiscardDraft(d.id)}
                    >
                      破棄
                    </button>
                  }
                />
              ))}
            </div>
          )}

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
                        削除
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
