"use client";

import type { QuizSessionDto } from "@rigel/client";
import type { QuizKind } from "@rigel/schema";
import { QUIZ_KIND_LABELS } from "@rigel/ui";
import Link from "next/link";
import { notFound, useSearchParams } from "next/navigation";
import { Suspense, useEffect } from "react";
import { TrainingScreen } from "../../../components/training/TrainingScreen";
import type { AuthUser } from "../../../lib/api";

// 特訓UI（/training）の目視検証専用フィクスチャ（/dev/board と同じ流儀）。
// API・ログイン不要で TrainingScreen を描画する: user / startSession / finishSession /
// listSessions をフェイクで注入し、seed 固定で出題列を再現する。本番には出さない
// （NODE_ENV=production では 404）。
//
// 使い方（クエリで各フェーズを直接表示）:
//   /dev/training                                   … 種目選択（カードタップで開始ダイアログ→
//                                                     「開始」で 3→2→1 カウントダウンも目視できる）
//   /dev/training?phase=running&kind=chinitsu&seed=1 … セッション中（60秒。ダイアログと
//                                                     カウントダウンは自動スキップ）
//   /dev/training?phase=running&kind=efficiency&seconds=5 … 5秒で結果へ（見直しリストの確認用）
//   /dev/training?phase=result&kind=efficiency       … 結果画面へ即遷移（0秒・回答なし）

const DEV_USER: AuthUser = { id: "dev", plan: "free", handle: "dev", displayName: "Dev" };

/** fake start: 即 id を返す（remainingToday は client 型互換のために返すだけで、画面には表示しない）。 */
const fakeStart = async () => ({ ok: true as const, id: "dev-session", remainingToday: 2 });

/** fake finish: no-op（結果送信を発生させない）。 */
const fakeFinish = async () => ({ ok: true, status: 200 });

/** fake 直近記録（開始ダイアログの目視用。両種目を混ぜて種目絞りも確認できる）。 */
const FAKE_SESSIONS: QuizSessionDto[] = [
  { id: "r1", kind: "chinitsu", total: 12, correct: 9, durationMs: 60_000, createdAt: "2026-07-24T03:05:00.000Z" }, // prettier-ignore
  { id: "r2", kind: "efficiency", total: 10, correct: 7, durationMs: 60_000, createdAt: "2026-07-23T10:00:00.000Z" }, // prettier-ignore
  { id: "r3", kind: "chinitsu", total: 9, correct: 4, durationMs: 60_000, createdAt: "2026-07-22T00:30:00.000Z" }, // prettier-ignore
];
const fakeListSessions = async () => FAKE_SESSIONS;

function DevTrainingInner() {
  const params = useSearchParams();
  const phase = params.get("phase") ?? "select";
  const kindParam = params.get("kind");
  const kind: QuizKind =
    kindParam === "efficiency" || kindParam === "score" || kindParam === "chinitsuUkeire"
      ? kindParam
      : "chinitsu";
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

  // phase=running/result: 種目カード → 開始ダイアログの「開始」を自動クリックして即セッションへ
  // （カウントダウンは countdownSeconds=0 で飛ばす）。本番コンポーネントに dev 分岐を足さず、
  // フィクスチャ側の DOM 操作で賄う。「開始」は直近記録の取得後に出るためポーリングで待つ。
  useEffect(() => {
    if (phase === "select") return;
    const label = QUIZ_KIND_LABELS[kind];
    const card = Array.from(document.querySelectorAll("button")).find((b) =>
      b.textContent?.includes(label),
    );
    card?.click();
    const id = setInterval(() => {
      const start = Array.from(document.querySelectorAll("button")).find(
        (b) => b.textContent === "開始",
      );
      if (start) {
        start.click();
        clearInterval(id);
      }
    }, 50);
    return () => clearInterval(id);
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
        {link("?phase=running&kind=score&seed=1", "点数計算")}
        {link("?phase=running&kind=chinitsuUkeire&seed=1", "清一色何切る")}
        {link("?phase=running&kind=efficiency&seed=1&seconds=5", "5秒→結果")}
        {link("?phase=result&kind=efficiency&seed=1", "結果(空)")}
      </div>
      <TrainingScreen
        key={`${phase}-${kind}-${seed}-${sessionSeconds ?? "default"}`}
        seed={seed}
        sessionSeconds={sessionSeconds}
        // phase ショートカット時はカウントダウン（3秒）を待たせない。select から手で開始
        // したときは本番同様の 3→2→1 を目視できる。
        countdownSeconds={phase === "select" ? undefined : 0}
        user={DEV_USER}
        startSession={fakeStart}
        finishSession={fakeFinish}
        listSessions={fakeListSessions}
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
