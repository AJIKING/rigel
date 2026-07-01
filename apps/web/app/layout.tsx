import type { ReactNode } from "react";
import { AuthProvider } from "../lib/auth-context";
import "./theme.css";

export const metadata = {
  title: "rigel — 麻雀牌譜",
  description: "実物の麻雀卓を撮った写真から牌譜ドラフトを生成する",
};

// アドレスバー等の配色（フェルト緑）。アイコン（favicon.ico / icon.svg /
// apple-icon.png）と manifest は app/ 直下のファイル規約で自動注入される。
export const viewport = {
  themeColor: "#0b6249",
};

// 画面はそれぞれ自前の全画面シェル（themeApp / themeBoard）とヘッダーを持つ。
// layout は共通の枠を持たず、認証コンテキストだけを供給する。
export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="ja">
      <body style={{ margin: 0 }}>
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
