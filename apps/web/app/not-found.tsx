import { StatusScreen } from "../components/StatusScreen";

export const metadata = {
  title: "ページが見つかりません",
};

// 存在しない URL・notFound() の全体フォールバック（404）。
export default function NotFound() {
  return (
    <StatusScreen
      code={404}
      title="ページが見つかりません"
      message="URL が間違っているか、ページが移動・削除された可能性があります。"
    />
  );
}
