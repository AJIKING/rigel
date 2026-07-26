"use client";

import type { QuizSessionDto } from "@rigel/client";
import type { QuizKind } from "@rigel/schema";
import { notFound, useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { MyTrainingScreen } from "../../../components/mypage/MyTrainingScreen";

// マイページ「特訓」（サマリ・グラフ・履歴）の目視検証専用フィクスチャ（/dev/training と同じ流儀）。
// API・ログイン不要で MyTrainingScreen を描画する: 履歴と now を直接注入する。
// 本番には出さない（NODE_ENV=production では 404）。
//
// 使い方:
//   /dev/stats             … 記録あり（欠損日を含む45日ぶん。7日/30日/全期間の切替を目視）
//   /dev/stats?data=sparse … 記録が2日だけ（点が飛ぶ形・終端ラベル・欠損日の扱いの確認）
//   /dev/stats?data=empty  … 記録なし（グラフを出さず空状態になることの確認）

// now = JST 2026-07-24 12:00（グラフの右端）。
const NOW = new Date("2026-07-24T03:00:00.000Z");

/** 決定的な擬似乱数（seed 固定。実行ごとに形が変わらないように）。 */
function rand(seed: number): number {
  const x = Math.sin(seed * 12.9898) * 43758.5453;
  return x - Math.floor(x);
}

/**
 * 45日ぶんの履歴（1日おき前後に穴を空け、正解数はゆるやかに右肩上がり）。
 * 欠損日が線として繋がる形・目盛りの丸め・点の間引き（30日以上）を一度に確認できる。
 */
function denseSessions(): QuizSessionDto[] {
  const out: QuizSessionDto[] = [];
  for (let back = 44; back >= 0; back--) {
    const r = rand(back + 1);
    if (r < 0.42) continue; // 記録の無い日
    const kind: QuizKind = r < 0.62 ? "efficiency" : r < 0.82 ? "score" : "chinitsu";
    const day = new Date(NOW.getTime() - back * 86_400_000).toISOString().slice(0, 10);
    out.push({
      id: `d${back}`,
      kind,
      total: 14,
      correct: Math.round(4 + (44 - back) * 0.14 + r * 3),
      durationMs: 60_000,
      createdAt: `${day}T04:00:00.000Z`,
    });
  }
  return out;
}

const SPARSE: QuizSessionDto[] = [
  { id: "s1", kind: "chinitsu", total: 14, correct: 12, durationMs: 60_000, createdAt: "2026-07-19T04:00:00.000Z" }, // prettier-ignore
  { id: "s2", kind: "chinitsu", total: 14, correct: 7, durationMs: 60_000, createdAt: "2026-07-23T04:00:00.000Z" }, // prettier-ignore
];

function DevStatsInner() {
  const data = useSearchParams().get("data");
  const sessions = data === "empty" ? [] : data === "sparse" ? SPARSE : denseSessions();
  return <MyTrainingScreen key={data ?? "dense"} initialSessions={sessions} now={NOW} />;
}

export default function DevStatsPage() {
  if (process.env.NODE_ENV === "production") notFound();
  return (
    <Suspense>
      <DevStatsInner />
    </Suspense>
  );
}
