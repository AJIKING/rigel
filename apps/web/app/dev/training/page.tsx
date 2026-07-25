"use client";

import type { QuizKind } from "@rigel/schema";
import { QUIZ_KIND_LABELS } from "@rigel/ui";
import Link from "next/link";
import { notFound, useSearchParams } from "next/navigation";
import { Suspense, useEffect } from "react";
import { TrainingScreen } from "../../../components/training/TrainingScreen";
import type { AuthUser } from "../../../lib/api";

// 特訓UI（/training）の目視検証専用フィクスチャ（/dev/board と同じ流儀）。
// API・ログイン不要で TrainingScreen を描画する: user / startSession / finishSession を
// フェイクで注入し、seed 固定で出題列を再現する。本番には出さない（NODE_ENV=production では 404）。
//
// 使い方（クエリで各フェーズを直接表示）:
//   /dev/training                                   … 種目選択
//   /dev/training?phase=running&kind=chinitsu&seed=1 … セッション中（60秒）
//   /dev/training?phase=running&kind=efficiency&seconds=5 … 5秒で結果へ（見直しリストの確認用）
//   /dev/training?phase=result&kind=efficiency       … 結果画面へ即遷移（0秒・回答なし）

const DEV_USER: AuthUser = { id: "dev", plan: "free", handle: "dev", displayName: "Dev" };

/** fake start: 即 id を返す（remainingToday は client 型互換のために返すだけで、画面には表示しない）。 */
const fakeStart = async () => ({ ok: true as const, id: "dev-session", remainingToday: 2 });

/** fake finish: no-op（結果送信を発生させない）。 */
const fakeFinish = async () => ({ ok: true, status: 200 });

function DevTrainingInner() {
  const params = useSearchParams();
  const phase = params.get("phase") ?? "select";
  const kind: QuizKind = params.get("kind") === "efficiency" ? "efficiency" : "chinitsu";
  const seedParam = Number(params.get("seed"));
  const seed = Number.isFinite(seedParam) && seedParam > 0 ? seedParam : 1;
  const secondsParam = Number(params.get("seconds"));
  // phase=result は 0 秒（開始と同時に結果へ）。running は ?seconds= で短縮できる（既定60秒）。
  const sessionSeconds =
    phase === "result"
      ? 0
      : Number.isFinite(secondsParam) && secondsParam > 0
        ? secondsParam
        : undefined;

  // phase=running/result: 種目カードを自動クリックして即セッションへ。
  // 本番コンポーネントに dev 分岐を足さず、フィクスチャ側の DOM 操作で賄う。
  useEffect(() => {
    if (phase === "select") return;
    const label = QUIZ_KIND_LABELS[kind];
    const btn = Array.from(document.querySelectorAll("button")).find((b) =>
      b.textContent?.includes(label),
    );
    btn?.click();
  }, [phase, kind, seed, sessionSeconds]);

  const link = (q: string, label: string) => (
    <Link href={`/dev/training${q}`} style={{ color: "#8fd6ff", marginRight: 12 }}>
      {label}
    </Link>
  );

  return (
    <>
      <div style={{ background: "#101216", padding: "8px 16px", fontSize: 12 }}>
        <span style={{ color: "#888", marginRight: 12 }}>dev:</span>
        {link("", "選択")}
        {link("?phase=running&kind=chinitsu&seed=1", "清一色")}
        {link("?phase=running&kind=efficiency&seed=1", "牌効率")}
        {link("?phase=running&kind=efficiency&seed=1&seconds=5", "5秒→結果")}
        {link("?phase=result&kind=efficiency&seed=1", "結果(空)")}
      </div>
      <TrainingScreen
        key={`${phase}-${kind}-${seed}-${sessionSeconds ?? "default"}`}
        seed={seed}
        sessionSeconds={sessionSeconds}
        user={DEV_USER}
        startSession={fakeStart}
        finishSession={fakeFinish}
      />
    </>
  );
}

export default function DevTrainingPage() {
  if (process.env.NODE_ENV === "production") notFound();
  return (
    <Suspense>
      <DevTrainingInner />
    </Suspense>
  );
}
