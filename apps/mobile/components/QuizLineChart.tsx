import { StyleSheet, Text, View } from "react-native";
import Svg, { Circle, Polyline, Text as SvgText } from "react-native-svg";
import { quizChartSeries, type QuizDayPoint } from "@rigel/ui";
import { colors, radius } from "../lib/theme";

// viewBox 座標（表示は幅100%に伸縮）。web の QuizLineChart と同じ比率。
const W = 640;
const H = 160;
const PAD_X = 10;
const PAD_TOP = 10;
const PAD_BOTTOM = 24;

// 白地カード上の暗色（軸ラベル・タイトル。特訓画面の手牌カードと同じトーンに合わせる）。
const INK_SOFT = "rgba(23,26,31,0.55)";

/**
 * 1分あたり正解数（correctPerMinute）の推移の SVG 折れ線
 * （react-native-svg は既存依存。依存追加なし）。白地カード（角丸・影）に載せ、
 * title を渡すと小ラベルを添える（web のグラフカードと同じ見た目）。
 * 系列の計算（欠損日の 0 埋め・スケール上限・軸ラベル）は @rigel/ui の quizChartSeries に
 * 置き、ここでは座標へのスケーリングと描画だけを行う。
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
  const { values, max, labels } = quizChartSeries(points);
  if (values.length === 0) return null;

  const x = (i: number) =>
    values.length === 1 ? W / 2 : PAD_X + (i * (W - PAD_X * 2)) / (values.length - 1);
  const y = (v: number) => PAD_TOP + (1 - v / max) * (H - PAD_TOP - PAD_BOTTOM);

  return (
    <View style={styles.card} accessibilityLabel={accessibilityLabel}>
      {title ? <Text style={styles.title}>{title}</Text> : null}
      <Svg viewBox={`0 0 ${W} ${H}`} width="100%" height={120}>
        <Polyline
          points={values.map((v, i) => `${x(i)},${y(v)}`).join(" ")}
          fill="none"
          stroke={colors.accent}
          strokeWidth={2}
        />
        {values.map((v, i) => (
          <Circle key={i} cx={x(i)} cy={y(v)} r={3} fill={colors.accent} />
        ))}
        {labels.map((l) => (
          <SvgText
            key={l.index}
            x={x(l.index)}
            y={H - 6}
            textAnchor="middle"
            fontSize={10}
            fill={INK_SOFT}
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
    backgroundColor: "#f7f3e9",
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
