// 特訓グラフ（SVG 折れ線）。Android の react-native-svg は SVG をレイアウトサイズの
// ビットマップへ描くため、高さ制約の無い場所（FlatList ヘッダ内のカード）で
// パーセント指定の height を持つと巨大ビットマップでクラッシュする
// （実測: Canvas: trying to draw too large(1GB) bitmap. 2026-07-29 エミュレータ）。
// サイズは style の width + aspectRatio だけで決める、を回帰として固定する。

import { render, screen } from "@testing-library/react-native";
import { QUIZ_CHART_BOX, type QuizDayPoint } from "@rigel/ui";
import { QuizLineChart } from "./QuizLineChart";

const points: QuizDayPoint[] = [
  { day: "2026-07-27", sessions: 1, correct: 7, total: 10, accuracy: 0.7, correctPerMinute: 3.5 },
  { day: "2026-07-28", sessions: 1, correct: 8, total: 10, accuracy: 0.8, correctPerMinute: 4.2 },
];

function renderChart() {
  render(
    <QuizLineChart
      points={points}
      title="何切る"
      meta="2回 ・ ベスト 4.2"
      accessibilityLabel="何切るの1分あたり正解数の推移"
    />,
  );
  return screen.getByLabelText("何切るの1分あたり正解数の推移");
}

describe("QuizLineChart のサイズ決め", () => {
  it("Svg にパーセントの width/height プロップを渡さない（Android のビットマップ暴発防止）", () => {
    const svg = renderChart();
    expect(svg.props.width).toBeUndefined();
    expect(svg.props.height).toBeUndefined();
  });

  it("サイズは style の width:100% + viewBox の縦横比で決める", () => {
    const svg = renderChart();
    const style = Array.isArray(svg.props.style)
      ? Object.assign({}, ...svg.props.style)
      : svg.props.style;
    expect(style.width).toBe("100%");
    expect(style.aspectRatio).toBeCloseTo(QUIZ_CHART_BOX.w / QUIZ_CHART_BOX.h);
  });
});
