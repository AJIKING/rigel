"use client";

import { quizChartSeries, quizRateLabel, type QuizDayPoint } from "@rigel/ui";
import { useState } from "react";
import t from "./training-stats.module.css";

// viewBox 座標（表示は CSS で幅100%に伸縮）。左は y 目盛り、下は日付軸、上は終端の値ラベルの余白。
const W = 640;
const H = 190;
const PAD_L = 38;
const PAD_R = 16;
const PAD_TOP = 22;
const PAD_BOTTOM = 26;

/**
 * 1分あたり正解数（correctPerMinute）の推移の自前 SVG 折れ線（依存追加なし）。
 * 系列の計算（欠損日=null・切りの良い目盛り・軸ラベル）は @rigel/ui の quizChartSeries に置き、
 * ここでは座標へのスケーリングと描画だけを行う。カード（白地・タイトル）ごと持つので、
 * 期間内に記録が1日も無ければ null を返して呼び出し側は何も出さない（mobile と同じ形）。
 *
 * 描画の決まりごと（データビジュアライゼーションの基本形に合わせる）:
 * - 記録の無い日は点を打たない（0 埋めすると「やらなかった日」が「成績0」に見える）。
 * - 目盛りは 0 起点の実線ヘアライン。線は 2px 丸端、面は同色の薄いウォッシュ。
 * - 値ラベルは終端の1点だけ（全点に数字を置かない）。他の値はホバー/フォーカスで読む。
 */
export function QuizLineChart({ points, title }: { points: QuizDayPoint[]; title: string }) {
  const { values, line, max, ticks, labels, dayLabels, lastIndex, hasData } =
    quizChartSeries(points);
  const [hover, setHover] = useState<number | null>(null);
  if (!hasData) return null;

  const x = (i: number) =>
    values.length === 1
      ? (PAD_L + W - PAD_R) / 2
      : PAD_L + (i * (W - PAD_L - PAD_R)) / (values.length - 1);
  const y = (v: number) => PAD_TOP + (1 - v / max) * (H - PAD_TOP - PAD_BOTTOM);
  const baseY = y(0);

  // 面（折れ線の下を薄く塗る）。線と同じ点列を辿り、baseline まで下ろして閉じる。
  const areaPath = line.length
    ? `M ${x(line[0]!.index)} ${baseY} ` +
      line.map((p) => `L ${x(p.index)} ${y(p.value)}`).join(" ") +
      ` L ${x(line[line.length - 1]!.index)} ${baseY} Z`
    : "";
  // 点は数が少ないときだけ全部打つ（30日/全期間で打つと潰れて読めない）。
  const showAllDots = line.length <= 14;

  /** ポインタ x 座標 → 最も近い日の index。 */
  function pick(clientX: number, el: SVGSVGElement) {
    const rect = el.getBoundingClientRect();
    const ratio = (clientX - rect.left) / rect.width;
    const px = ratio * W;
    const span = W - PAD_L - PAD_R;
    const i = Math.round(((px - PAD_L) / span) * (values.length - 1));
    setHover(Math.min(values.length - 1, Math.max(0, i)));
  }

  return (
    <div className={t.chartCard}>
      <p className={t.chartTitle}>{title}</p>
      <div className={t.chartBody}>
        <svg
          role="img"
          aria-label={`${title}の推移（${dayLabels[0]}〜${dayLabels[dayLabels.length - 1]}、最新 ${quizRateLabel(
            lastIndex === null ? null : values[lastIndex]!,
          )}）。左右キーで各日の値を読み上げます`}
          tabIndex={0}
          viewBox={`0 0 ${W} ${H}`}
          className={t.chart}
          onPointerMove={(e) => pick(e.clientX, e.currentTarget)}
          onPointerLeave={() => setHover(null)}
          onBlur={() => setHover(null)}
          onKeyDown={(e) => {
            if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
            e.preventDefault();
            const step = e.key === "ArrowRight" ? 1 : -1;
            setHover((cur) => {
              const next = (cur ?? lastIndex ?? 0) + step;
              return Math.min(values.length - 1, Math.max(0, next));
            });
          }}
        >
          <defs>
            <linearGradient id="quizChartWash" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--chart-ink)" stopOpacity="0.18" />
              <stop offset="100%" stopColor="var(--chart-ink)" stopOpacity="0.02" />
            </linearGradient>
          </defs>

          {/* y 目盛り（実線ヘアライン＋数値。軸だけで値が読めるように） */}
          {ticks.map((tick) => (
            <g key={tick.value}>
              <line
                x1={PAD_L}
                x2={W - PAD_R}
                y1={y(tick.value)}
                y2={y(tick.value)}
                className={t.grid}
              />
              <text
                x={PAD_L - 8}
                y={y(tick.value)}
                textAnchor="end"
                dominantBaseline="middle"
                className={t.axis}
              >
                {tick.text}
              </text>
            </g>
          ))}

          <path d={areaPath} fill="url(#quizChartWash)" />
          <polyline
            points={line.map((p) => `${x(p.index)},${y(p.value)}`).join(" ")}
            fill="none"
            stroke="var(--chart-ink)"
            strokeWidth="2"
            strokeLinejoin="round"
            strokeLinecap="round"
          />
          {showAllDots &&
            line.map((p) => (
              <circle
                key={p.index}
                cx={x(p.index)}
                cy={y(p.value)}
                r="4"
                fill="var(--chart-ink)"
                className={t.dot}
              />
            ))}

          {/* 終端の強調（サーフェスリング＋値ラベル）。値ラベルは1点だけに絞る。 */}
          {lastIndex !== null && (
            <>
              <circle
                cx={x(lastIndex)}
                cy={y(values[lastIndex]!)}
                r="4.5"
                fill="var(--chart-ink)"
                className={t.dot}
              />
              <text
                x={Math.min(x(lastIndex), W - PAD_R - 12)}
                y={y(values[lastIndex]!) - 12}
                textAnchor="middle"
                className={t.endLabel}
              >
                {quizRateLabel(values[lastIndex]!)}
              </text>
            </>
          )}

          {/* ホバー/フォーカスの十字線と該当点 */}
          {hover !== null && (
            <>
              <line x1={x(hover)} x2={x(hover)} y1={PAD_TOP} y2={baseY} className={t.crosshair} />
              {values[hover] !== null && (
                <circle
                  cx={x(hover)}
                  cy={y(values[hover]!)}
                  r="4.5"
                  fill="var(--chart-ink)"
                  className={t.dot}
                />
              )}
            </>
          )}

          {labels.map((l) => (
            <text key={l.index} x={x(l.index)} y={H - 6} textAnchor="middle" className={t.axis}>
              {l.text}
            </text>
          ))}
        </svg>

        {hover !== null && (
          <div
            className={t.tip}
            style={{ left: `${(x(hover) / W) * 100}%` }}
            role="status"
            aria-live="polite"
          >
            <b>{dayLabels[hover]}</b>
            <span>{quizRateLabel(values[hover]!)}</span>
          </div>
        )}
      </div>
    </div>
  );
}
