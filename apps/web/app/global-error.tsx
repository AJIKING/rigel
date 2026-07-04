"use client";

import { StatusScreen } from "../components/StatusScreen";
import "./theme.css";

// ルートレイアウト自体が壊れたときの最終フォールバック。
// layout.tsx を置き換えるため <html>/<body> と theme.css を自前で持つ。
export default function GlobalError({ reset }: { error: Error; reset: () => void }) {
  return (
    <html lang="ja">
      <body style={{ margin: 0 }}>
        <StatusScreen
          code={500}
          title="エラーが発生しました"
          message="予期しないエラーが発生しました。時間をおいて再度お試しください。"
          onRetry={reset}
        />
      </body>
    </html>
  );
}
