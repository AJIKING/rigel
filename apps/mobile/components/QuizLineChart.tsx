import { StyleSheet, Text, View } from "react-native";
import Svg, {
  Circle,
  Defs,
  G,
  Line,
  LinearGradient,
  Path,
  Polyline,
  Stop,
  Text as SvgText,
} from "react-native-svg";
import {
  QUIZ_CHART_BOX,
  quizChartGeometry,
  quizChartSeries,
  quizRateLabel,
  type QuizDayPoint,
} from "@rigel/ui";
import { colors, radius } from "../lib/theme";

// viewBox の箱（縦横比・余白は @rigel/ui が持つ＝web と必ず同じ比率・同じ余白になる）。
const { w: W, h: H, padL: PAD_L, padR: PAD_R } = QUIZ_CHART_BOX;

// ダーク地カード上の明色（軸ラベル 5.1:1）。web の training-stats.module.css と同値。
const INK_AXIS = "rgba(245,246,247,0.55)";
const GRID = "rgba(245,246,247,0.12)";
// 線色は emLite（#3ec487）。この緑は特訓の見直しで既に「○＝正解」を指す色で、
// グラフが描くのも「1分あたり正解数」なので意味が一致する（ダーク地に 7.3:1）。
// アクセントのオレンジは操作要素に予約し、データには使わない。
// CARD は点の縁取り（サーフェスリング）に使うカード地の色。
const CHART_INK = colors.emLite;
const CARD = "#1a1d23";

/**
 * 1分あたり正解数（correctPerMinute）の推移の SVG 折れ線
 * （react-native-svg は既存依存。依存追加なし）。カード見出しは種目名＋その種目のサマリで、
 * 種目ごとに1枚ずつ縦に並べる（web の QuizLineChart と同一の見た目・同一の決まりごと）。
 * 系列の計算（欠損日=null・切りの良い目盛り・軸ラベル）も viewBox 内の座標計算も
 * @rigel/ui（quizChartSeries / quizChartGeometry）に置き、ここでは描画だけを行う。
 *
 * **並べた全カードで線の色は同じ**。同じ指標の別ファセットなので、種目ごとに色を変えると
 * 「色が違う＝別の量」と誤読される。種目の区別は見出しの種目名が担う。
 */
export function QuizLineChart({
  points,
  accessibilityLabel,
  title,
  meta,
}: {
  points: QuizDayPoint[];
  accessibilityLabel: string;
  /** カード見出し（種目名）。 */
  title: string;
  /** 見出し右の小さなサマリ（「2回 ・ ベスト 7 ・ 正答率 60%」）。 */
  meta: string;
}) {
  const series = quizChartSeries(points);
  const { values, line, ticks, labels, lastIndex, hasData } = series;
  const { x, y, linePoints, areaPath, showAllDots } = quizChartGeometry(series);

  return (
    <View style={styles.card}>
      <View style={styles.head}>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.meta}>{meta}</Text>
      </View>
      {/* 高さは幅から縦横比で決める（固定 height だと端末幅によって上下に余白ができたり
          図が縮んだりする）。並べて見るので1枚は低く保つ。 */}
      {!hasData ? null : (
        <Svg
          viewBox={`0 0 ${W} ${H}`}
          width="100%"
          height="100%"
          style={{ width: "100%", aspectRatio: W / H }}
          accessibilityLabel={accessibilityLabel}
        >
          <Defs>
            <LinearGradient id="quizChartWash" x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0%" stopColor={CHART_INK} stopOpacity={0.18} />
              <Stop offset="100%" stopColor={CHART_INK} stopOpacity={0.02} />
            </LinearGradient>
          </Defs>

          {/* y 目盛り（実線ヘアライン＋数値。軸だけで値が読めるように） */}
          {ticks.map((tick) => (
            <G key={tick.value}>
              <Line
                x1={PAD_L}
                x2={W - PAD_R}
                y1={y(tick.value)}
                y2={y(tick.value)}
                stroke={GRID}
                strokeWidth={1}
              />
              <SvgText
                x={PAD_L - 8}
                y={y(tick.value) + 6}
                textAnchor="end"
                fontSize={16}
                fill={INK_AXIS}
              >
                {tick.text}
              </SvgText>
            </G>
          ))}

          <Path d={areaPath} fill="url(#quizChartWash)" />
          <Polyline
            points={linePoints}
            fill="none"
            stroke={CHART_INK}
            strokeWidth={3}
            strokeLinejoin="round"
            strokeLinecap="round"
          />
          {showAllDots
            ? line.map((p) => (
                <Circle
                  key={p.index}
                  cx={x(p.index)}
                  cy={y(p.value)}
                  r={6.5}
                  fill={CHART_INK}
                  stroke={CARD}
                  strokeWidth={3}
                />
              ))
            : null}

          {/* 終端の強調（サーフェスリング＋値ラベル）。値ラベルは1点だけに絞る。 */}
          {lastIndex !== null ? (
            <>
              <Circle
                cx={x(lastIndex)}
                cy={y(values[lastIndex]!)}
                r={7}
                fill={CHART_INK}
                stroke={CARD}
                strokeWidth={3}
              />
              <SvgText
                x={Math.min(x(lastIndex), W - PAD_R - 12)}
                y={y(values[lastIndex]!) - 14}
                textAnchor="middle"
                fontSize={19}
                fontWeight="bold"
                fill={colors.white}
              >
                {quizRateLabel(values[lastIndex]!)}
              </SvgText>
            </>
          ) : null}

          {labels.map((l) => (
            <SvgText
              key={l.index}
              x={x(l.index)}
              y={H - 9}
              textAnchor="middle"
              fontSize={16}
              fill={INK_AXIS}
            >
              {l.text}
            </SvgText>
          ))}
        </Svg>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  // カード地はページに合わせたダーク（[決定] 2026-07-27）。明るい地では軸ラベルを
  // AA 4.5:1 まで上げられず、暗い画面の中で板が光っていた。
  card: {
    backgroundColor: CARD,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
    borderRadius: radius.card,
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  // 見出し行: 左に種目名・右にその種目/期間の小さなサマリ。
  head: {
    flexDirection: "row",
    alignItems: "baseline",
    justifyContent: "space-between",
    gap: 8,
    marginBottom: 2,
  },
  title: { color: colors.white, fontSize: 13, fontWeight: "800" },
  meta: {
    color: colors.w45,
    fontSize: 10.5,
    fontWeight: "700",
    fontVariant: ["tabular-nums"],
    flexShrink: 1,
  },
});
