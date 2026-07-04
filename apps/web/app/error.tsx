"use client";

import { StatusScreen } from "../components/StatusScreen";

// ページ描画中の予期しないエラーの全体フォールバック（500 相当）。
// reset() は該当セグメントの再レンダリングを試みる。
export default function GlobalErrorPage({ reset }: { error: Error; reset: () => void }) {
  return (
    <StatusScreen
      code={500}
      title="エラーが発生しました"
      message="予期しないエラーが発生しました。時間をおいて再度お試しください。"
      onRetry={reset}
    />
  );
}
