import type { ReactNode } from "react";

// ページ本体（page.tsx）はフックを使うクライアントコンポーネントなので、
// metadata はこの薄い layout が持つ。作成画面は本人専用・検索結果に載せない。
export const metadata = {
  title: "新しい牌譜",
  robots: { index: false },
};

export default function NewGameLayout({ children }: { children: ReactNode }) {
  return children;
}
