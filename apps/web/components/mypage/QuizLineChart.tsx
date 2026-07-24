"use client";

import { quizChartSeries, type QuizDayPoint } from "@rigel/ui";
import t from "./training-stats.module.css";

// viewBox 座標（表示は CSS で幅100%に伸縮）。
const W = 640;
const H = 160;
const PAD_X = 10;
const PAD_TOP = 10;
const PAD_BOTTOM = 24;

/**
 * 1分あたり正解数（correctPerMinute）の推移の自前 SVG 折れ線（依存追加なし）。
 * 系列の計算（欠損日の 0 埋め・スケール上限・軸ラベル）は @rigel/ui の quizChartSeries に置き、
 * ここでは座標へのスケーリングと描画だけを行う。
 */
export function QuizLineChart({ points }: { points: QuizDayPoint[] }) {
  const { values, max, labels } = quizChartSeries(points);
  if (values.length === 0) return null;

  const x = (i: number) =>
    values.length === 1 ? W / 2 : PAD_X + (i * (W - PAD_X * 2)) / (values.length - 1);
  const y = (v: number) => PAD_TOP + (1 - v / max) * (H - PAD_TOP - PAD_BOTTOM);

  return (
    <svg
      role="img"
      aria-label="1分あたり正解数の推移"
      viewBox={`0 0 ${W} ${H}`}
      className={t.chart}
    >
      <polyline
        points={values.map((v, i) => `${x(i)},${y(v)}`).join(" ")}
        fill="none"
        stroke="var(--accent)"
        strokeWidth="2"
      />
      {values.map((v, i) => (
        <circle key={i} cx={x(i)} cy={y(v)} r="3" fill="var(--accent)" />
      ))}
      {labels.map((l) => (
        <text key={l.index} x={x(l.index)} y={H - 6} textAnchor="middle" className={t.axis}>
          {l.text}
        </text>
      ))}
    </svg>
  );
}
