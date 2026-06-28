import Link from "next/link";

export default function Home() {
  return (
    <div>
      <h1>麻雀牌譜を、写真から</h1>
      <p style={{ color: "#555", lineHeight: 1.7 }}>
        実物の麻雀卓を撮るだけで、盤面（手牌・鳴き・河）の牌譜ドラフトを自動生成します。
        確信度の低い箇所だけを直して、保存・共有できます。
      </p>
      <ul style={{ color: "#555", lineHeight: 1.8 }}>
        <li>卓全体を1枚 + 各自の手牌を撮影</li>
        <li>AI が牌譜ドラフトを生成（読めない牌は推測せず「要確認」）</li>
        <li>人が確認・修正して保存</li>
      </ul>
      <div style={{ display: "flex", gap: 12, marginTop: 16 }}>
        <Link
          href="/kifu/sample"
          style={{
            padding: "10px 16px",
            borderRadius: 8,
            background: "#222",
            color: "#fff",
            textDecoration: "none",
          }}
        >
          サンプル牌譜を見る
        </Link>
        <Link
          href="/login"
          style={{
            padding: "10px 16px",
            borderRadius: 8,
            border: "1px solid #ccc",
            textDecoration: "none",
            color: "#222",
          }}
        >
          ログイン
        </Link>
      </div>
    </div>
  );
}
