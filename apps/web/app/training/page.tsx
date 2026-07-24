import { TrainingScreen } from "../../components/training/TrainingScreen";

// 特訓は要ログインの本人向け機能ページ。検索結果に載せない。
export const metadata = {
  title: "特訓",
  robots: { index: false },
};

/** 特訓（60秒タイムアタック: 清一色多面待ち / 牌効率）。未ログインは画面内でログイン導線を出す。 */
export default function TrainingPage() {
  return <TrainingScreen />;
}
