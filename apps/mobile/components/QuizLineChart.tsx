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
import { quizChartSeries, quizRateLabel, type QuizDayPoint } from "@rigel/ui";
import { radius } from "../lib/theme";

// viewBox 座標（表示は幅100%に伸縮）。web の QuizLineChart と同じ比率・同じ余白。
const W = 640;
const H = 190;
const PAD_L = 38;
const PAD_R = 16;
const PAD_TOP = 22;
const PAD_BOTTOM = 26;

// 白地カード上の暗色（軸ラベル・タイトル。特訓画面の手牌カードと同じトーンに合わせる）。
const INK_SOFT = "rgba(23,26,31,0.55)";
const INK_AXIS = "rgba(23,26,31,0.5)";
const INK_VALUE = "rgba(23,26,31,0.82)";
const GRID = "rgba(23,26,31,0.12)";
// 線色はアクセント（#ff9e45）だと白地に 1.8:1 しか出ず図形として見えないため、
// 同じ色相の暗いステップへ落として 4.4:1 を確保する（web の --chart-ink と同値）。
const CHART_INK = "#b4560c";
const CARD = "#f7f3e9";

/**
 * 1分あたり正解数（correctPerMinute）の推移の SVG 折れ線
 * （react-native-svg は既存依存。依存追加なし）。白地カード（角丸・影）に載せ、
 * title を渡すと小ラベルを添える（web のグラフカードと同じ見た目）。
 * 系列の計算（欠損日=null・切りの良い目盛り・軸ラベル）は @rigel/ui の quizChartSeries に
 * 置き、ここでは座標へのスケーリングと描画だけを行う。
 * 期間内に記録が1日も無ければ null（空のカードを出さない）。
 */
export function QuizLineChart({
  points,
  accessibilityLabel,
  title,
}: {
  points: QuizDayPoint[];
  accessibilityLabel: string;
  title?: string;
}) {
  const { values, line, max, ticks, labels, lastIndex, hasData } = quizChartSeries(points);
  if (!hasData) return null;

  const x = (i: number) =>
    values.length === 1
      ? (PAD_L + W - PAD_R) / 2
      : PAD_L + (i * (W - PAD_L - PAD_R)) / (values.length - 1);
  const y = (v: number) => PAD_TOP + (1 - v / max) * (H - PAD_TOP - PAD_BOTTOM);
  const baseY = y(0);

  // 面（折れ線の下の薄いウォッシュ）。線と同じ点列を辿り baseline まで下ろして閉じる。
  const areaPath =
    `M ${x(line[0]!.index)} ${baseY} ` +
    line.map((p) => `L ${x(p.index)} ${y(p.value)}`).join(" ") +
    ` L ${x(line[line.length - 1]!.index)} ${baseY} Z`;
  // 点は数が少ないときだけ全部打つ（30日/全期間で打つと潰れて読めない）。
  const showAllDots = line.length <= 14;

  return (
    <View style={styles.card} accessibilityLabel={accessibilityLabel}>
      {title ? <Text style={styles.title}>{title}</Text> : null}
      <Svg viewBox={`0 0 ${W} ${H}`} width="100%" height={140}>
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
              y={y(tick.value) + 3}
              textAnchor="end"
              fontSize={10}
              fill={INK_AXIS}
            >
              {tick.text}
            </SvgText>
          </G>
        ))}

        <Path d={areaPath} fill="url(#quizChartWash)" />
        <Polyline
          points={line.map((p) => `${x(p.index)},${y(p.value)}`).join(" ")}
          fill="none"
          stroke={CHART_INK}
          strokeWidth={2}
          strokeLinejoin="round"
          strokeLinecap="round"
        />
        {showAllDots
          ? line.map((p) => (
              <Circle
                key={p.index}
                cx={x(p.index)}
                cy={y(p.value)}
                r={4}
                fill={CHART_INK}
                stroke={CARD}
                strokeWidth={2}
              />
            ))
          : null}

        {/* 終端の強調（サーフェスリング＋値ラベル）。値ラベルは1点だけに絞る。 */}
        {lastIndex !== null ? (
          <>
            <Circle
              cx={x(lastIndex)}
              cy={y(values[lastIndex]!)}
              r={4.5}
              fill={CHART_INK}
              stroke={CARD}
              strokeWidth={2}
            />
            <SvgText
              x={Math.min(x(lastIndex), W - PAD_R - 12)}
              y={y(values[lastIndex]!) - 12}
              textAnchor="middle"
              fontSize={12}
              fontWeight="bold"
              fill={INK_VALUE}
            >
              {quizRateLabel(values[lastIndex]!)}
            </SvgText>
          </>
        ) : null}

        {labels.map((l) => (
          <SvgText
            key={l.index}
            x={x(l.index)}
            y={H - 6}
            textAnchor="middle"
            fontSize={10}
            fill={INK_AXIS}
          >
            {l.text}
          </SvgText>
        ))}
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  // 白地カード（グラフの視認性のため白地は維持。角丸は共通トークン radius.card）
  card: {
    backgroundColor: CARD,
    borderRadius: radius.card,
    paddingVertical: 10,
    paddingHorizontal: 12,
    shadowColor: "#000",
    shadowOpacity: 0.3,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 },
    elevation: 3,
  },
  title: { color: INK_SOFT, fontSize: 11, fontWeight: "700", marginBottom: 4 },
});
