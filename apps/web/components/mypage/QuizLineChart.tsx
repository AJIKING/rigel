"use client";

import {
  QUIZ_CHART_BOX,
  quizChartGeometry,
  quizChartSeries,
  quizRateLabel,
  type QuizDayPoint,
} from "@rigel/ui";
import { useState } from "react";
import t from "./training-stats.module.css";

// viewBox の箱（縦横比・余白は @rigel/ui が持つ。表示は CSS で幅100%に伸縮）。
const { w: W, h: H, padL: PAD_L, padR: PAD_R, padTop: PAD_TOP } = QUIZ_CHART_BOX;

/**
 * 1分あたり正解数（correctPerMinute）の推移の自前 SVG 折れ線（依存追加なし）。
 * 系列の計算（欠損日=null・切りの良い目盛り・軸ラベル）も viewBox 内の座標計算も
 * @rigel/ui（quizChartSeries / quizChartGeometry）に置き、ここでは描画だけを行う。カード（見出し＝種目名＋その種目のサマリ）ごと持つ。
 * 種目ごとに1枚ずつ縦に並べる（[決定] 2026-07-27。種目をまたいだ合算は指標として成立しない）。
 *
 * 描画の決まりごと（データビジュアライゼーションの基本形に合わせる）:
 * - 記録の無い日は点を打たない（0 埋めすると「やらなかった日」が「成績0」に見える）。
 * - 目盛りは 0 起点の実線ヘアライン。線は 2px 丸端、面は同色の薄いウォッシュ。
 * - 値ラベルは終端の1点だけ（全点に数字を置かない）。他の値はホバー/フォーカスで読む。
 * - **並べた全カードで線の色は同じ**。同じ指標の別ファセットなので、種目ごとに色を
 *   変えると「色が違う＝別の量」と誤読される。種目の区別は見出しの種目名が担う。
 */
export function QuizLineChart({
  points,
  title,
  meta,
}: {
  points: QuizDayPoint[];
  /** カード見出し（種目名）。読み上げのグループ名にも使う。 */
  title: string;
  /** 見出し右の小さなサマリ（「2回 ・ ベスト 7 ・ 正答率 60%」）。 */
  meta: string;
}) {
  const series = quizChartSeries(points);
  const { values, line, ticks, labels, dayLabels, lastIndex, hasData } = series;
  const { x, y, baseY, linePoints, areaPath, showAllDots, indexAtRatio } =
    quizChartGeometry(series);
  const [hover, setHover] = useState<number | null>(null);

  /** ポインタ x 座標 → 最も近い日を選ぶ（丸めは共有の芯に任せる）。 */
  function pick(clientX: number, el: SVGSVGElement) {
    const rect = el.getBoundingClientRect();
    setHover(indexAtRatio((clientX - rect.left) / rect.width));
  }

  return (
    <div className={t.chartCard} role="group" aria-label={title}>
      <div className={t.chartHead}>
        <p className={t.chartTitle}>{title}</p>
        <p className={t.chartMeta} data-testid="board-meta">
          {meta}
        </p>
      </div>
      {!hasData ? null : (
        <div className={t.chartBody}>
          <svg
            role="img"
            aria-label={`1分あたり正解数の推移（${dayLabels[0]}〜${dayLabels[dayLabels.length - 1]}、最新 ${quizRateLabel(
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
              points={linePoints}
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
              <text key={l.index} x={x(l.index)} y={H - 9} textAnchor="middle" className={t.axis}>
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
      )}
    </div>
  );
}
