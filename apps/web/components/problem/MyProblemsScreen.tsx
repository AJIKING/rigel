"use client";

import { PROBLEM_KIND_LABELS, PROBLEM_LIMIT, LIMIT_MESSAGES } from "@rigel/ui";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { deleteProblemAction, updateProblemAction } from "../../app/actions";
import { type ProblemPost } from "../../lib/api";
import { useAuth } from "../../lib/auth-context";
import { fmtDateSlash } from "../../lib/format";
import { useFavorites } from "../../lib/use-favorites";
import { AppHeader } from "../AppHeader";
import { GameCard } from "../GameCard";
import { MyPageTabs } from "../mypage/MyPageTabs";
import gc from "../game-card.module.css";
import s from "../list/kifu-list.module.css";
import p9 from "./problem.module.css";

/**
 * マイ何切る（自分の問題の管理）。牌譜のマイページ（/kifu）と同じ構造
 * （統計・クォータ・ツールバー・GameCard）。状態は draft / published の二択。
 * free は draft+published 合算 20 問まで。
 */
export function MyProblemsScreen({ initialPosts }: { initialPosts: ProblemPost[] }) {
  const { user } = useAuth();
  const router = useRouter();
  const { favs, toggle: toggleFav } = useFavorites();
  const [posts, setPosts] = useState(initialPosts);
  const [delArm, setDelArm] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<"all" | "published" | "draft">("all");

  const limit = PROBLEM_LIMIT[user?.plan ?? "free"];
  const atLimit = limit !== null && posts.length >= limit;
  const publishedCount = posts.filter((post) => post.status === "published").length;

  const view = useMemo(() => {
    let arr = posts.slice();
    if (status !== "all") arr = arr.filter((post) => post.status === status);
    if (q) arr = arr.filter((post) => post.title.includes(q));
    return arr.sort((a, b) => -a.createdAt.localeCompare(b.createdAt));
  }, [posts, status, q]);

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
            </div>
            {limit !== null && (
              <p className={s.quota}>
                何切る {posts.length} / {limit}問
              </p>
            )}
          </div>
          {atLimit && <p className={p9.limitNote}>{LIMIT_MESSAGES.problems}</p>}
          {err && <p className={p9.err}>{err}</p>}

          <div className={s.toolbar}>
            <div className={s.search}>
              <svg viewBox="0 0 24 24">
                <circle cx="11" cy="11" r="7" />
                <path d="M21 21l-4-4" />
              </svg>
              <input
                type="search"
                placeholder="問題を検索"
                aria-label="自分の問題を検索"
                value={q}
                onChange={(e) => setQ(e.target.value.trim())}
              />
            </div>
            <div className={s.sortwrap}>
              <select
                aria-label="状態で絞り込み"
                value={status}
                onChange={(e) => setStatus(e.target.value as typeof status)}
              >
                <option value="all">すべて</option>
                <option value="published">公開</option>
                <option value="draft">下書き</option>
              </select>
            </div>
            <button
              className={s.newbtn}
              disabled={atLimit}
              onClick={() => router.push("/problems/new")}
            >
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
            {view.length === 0 ? (
              <div className={gc.empty}>
                {posts.length === 0
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
                  faved={favs.has(post.id)}
                  onToggleFav={() => toggleFav(post.id)}
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
