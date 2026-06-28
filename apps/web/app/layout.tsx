import Link from "next/link";
import type { ReactNode } from "react";

export const metadata = {
  title: "rigel — 麻雀牌譜",
  description: "実物の麻雀卓を撮った写真から牌譜ドラフトを生成する",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="ja">
      <body style={{ fontFamily: "system-ui, sans-serif", margin: 0, color: "#222" }}>
        <header
          style={{
            display: "flex",
            alignItems: "center",
            gap: 16,
            padding: "12px 24px",
            borderBottom: "1px solid #eee",
          }}
        >
          <Link href="/" style={{ fontWeight: 700, textDecoration: "none", color: "#222" }}>
            rigel
          </Link>
          <nav style={{ display: "flex", gap: 12, fontSize: 14 }}>
            <Link href="/kifu">牌譜</Link>
            <Link href="/login">ログイン</Link>
          </nav>
        </header>
        <main style={{ padding: 24, maxWidth: 920, margin: "0 auto" }}>{children}</main>
      </body>
    </html>
  );
}
