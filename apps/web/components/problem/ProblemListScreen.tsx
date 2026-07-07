"use client";

import Link from "next/link";
import { PROBLEM_KIND_LABELS } from "@rigel/ui";
import { type ProblemPost } from "../../lib/api";
import { fmtDate } from "../../lib/format";
import { AppHeader } from "../AppHeader";
import s from "./problem.module.css";

/** 何切る問題の公開一覧（published のみ・新着順）。閲覧は誰でも。 */
export function ProblemListScreen({ posts }: { posts: ProblemPost[] }) {
  return (
    <div className={s.page}>
      <AppHeader active="problems" />
      <main className={s.listMain}>
        <div className={s.listHead}>
          <h1 className={s.listTitle}>何切る</h1>
          <Link href="/problems/mine" className={s.mineLink}>
            マイ何切る →
          </Link>
        </div>
        {posts.length === 0 ? (
          <p className={s.empty}>まだ公開された問題がありません。</p>
        ) : (
          <div className={s.cards}>
            {posts.map((p) => (
              <Link key={p.id} href={`/p/${p.id}`} className={s.card}>
                <span className={s.cardKind}>{PROBLEM_KIND_LABELS[p.problem.kind]}</span>
                <span className={s.cardTitle}>{p.title || "（無題の問題）"}</span>
                <span className={s.cardMeta}>{fmtDate(p.createdAt)}</span>
              </Link>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
