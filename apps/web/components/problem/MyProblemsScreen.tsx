"use client";

import { PROBLEM_KIND_LABELS, PROBLEM_LIMIT, LIMIT_MESSAGES } from "@rigel/ui";
import Link from "next/link";
import { useState } from "react";
import { deleteProblemAction, updateProblemAction } from "../../app/actions";
import { type ProblemPost } from "../../lib/api";
import { useAuth } from "../../lib/auth-context";
import { fmtDate } from "../../lib/format";
import { AppHeader } from "../AppHeader";
import s from "./problem.module.css";

/**
 * マイ何切る（自分の問題の管理）。状態は draft / published の二択
 * （公開非公開の概念なし）。free は draft+published 合算 20 問まで。
 */
export function MyProblemsScreen({ initialPosts }: { initialPosts: ProblemPost[] }) {
  const { user } = useAuth();
  const [posts, setPosts] = useState(initialPosts);
  const [delArm, setDelArm] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const limit = PROBLEM_LIMIT[user?.plan ?? "free"];
  const atLimit = limit !== null && posts.length >= limit;

  /** draft⇔published の切替（楽観更新・失敗でロールバック）。 */
  async function toggleStatus(post: ProblemPost) {
    const next = post.status === "draft" ? "published" : "draft";
    setPosts((cur) => cur.map((p) => (p.id === post.id ? { ...p, status: next } : p)));
    const res = await updateProblemAction(post.id, { status: next }).catch(() => ({
      ok: false,
      status: 0,
    }));
    if (!res.ok) {
      setPosts((cur) => cur.map((p) => (p.id === post.id ? { ...p, status: post.status } : p)));
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
    if (res.ok) setPosts((cur) => cur.filter((p) => p.id !== post.id));
    else setErr("削除に失敗しました。");
  }

  return (
    <div className={s.page}>
      <AppHeader active="problems" />
      <main className={s.listMain}>
        <div className={s.listHead}>
          <h1 className={s.listTitle}>マイ何切る</h1>
          {limit !== null && (
            <span className={`${s.quota} ${atLimit ? s.quotaWarn : ""}`}>
              {posts.length} / {limit}問
            </span>
          )}
          <Link
            href="/problems/new"
            className={`${s.newBtn} ${atLimit ? s.newBtnDisabled : ""}`}
            aria-disabled={atLimit}
          >
            ＋ 新しい問題
          </Link>
        </div>
        {atLimit && <p className={s.limitNote}>{LIMIT_MESSAGES.problems}</p>}
        {err && <p className={s.err}>{err}</p>}

        {posts.length === 0 ? (
          <p className={s.empty}>まだ問題がありません。「＋ 新しい問題」から作成できます。</p>
        ) : (
          <div className={s.cards}>
            {posts.map((p) => (
              <div key={p.id} className={s.card}>
                <span className={s.cardKind}>{PROBLEM_KIND_LABELS[p.problem.kind]}</span>
                <Link href={`/p/${p.id}`} className={s.cardTitle}>
                  {p.title || "（無題の問題）"}
                </Link>
                <span className={s.cardMeta}>
                  {fmtDate(p.createdAt)}
                  <span className={p.status === "draft" ? s.badgeDraft : s.badgePub}>
                    {p.status === "draft" ? "下書き" : "公開中"}
                  </span>
                </span>
                <div className={s.cardActs}>
                  <button type="button" onClick={() => void toggleStatus(p)}>
                    {p.status === "draft" ? "公開する" : "下書きに戻す"}
                  </button>
                  <Link href={`/problems/${p.id}/edit`}>編集</Link>
                  <button type="button" className={s.danger} onClick={() => void onDelete(p)}>
                    {delArm === p.id ? "もう一度押して削除" : "削除"}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
