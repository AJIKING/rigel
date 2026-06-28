import type { ReactNode } from "react";

export const metadata = {
  title: "rigel — 麻雀牌譜",
  description: "実物の麻雀卓を撮った写真から牌譜ドラフトを生成する",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="ja">
      <body>{children}</body>
    </html>
  );
}
