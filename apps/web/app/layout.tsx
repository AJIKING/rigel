import type { ReactNode } from "react";
import { AuthProvider } from "../lib/auth-context";
import { DEFAULT_DESCRIPTION, DEFAULT_TITLE, siteBaseUrl } from "../lib/og-meta";
import "./theme.css";

// metadataBase: /k/[gameId] の動的OGP（og:url・opengraph-image のURL）を
// 絶対URLへ解決するための基準。既定は本番ドメイン（wrangler のカスタムドメイン）。
export const metadata = {
  metadataBase: new URL(siteBaseUrl()),
  title: DEFAULT_TITLE,
  description: DEFAULT_DESCRIPTION,
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
