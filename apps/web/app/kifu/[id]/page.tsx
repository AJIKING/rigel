import Link from "next/link";
import { KifuBoard } from "../../../components/KifuBoard";
import { sampleKifu } from "../../../lib/sample-kifu";

// 牌譜詳細（土台）。現状はサンプル牌譜を表示する。実データ取得は保存/閲覧の実装後。
export default async function KifuDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const kifu = sampleKifu; // TODO: id から D1 取得

  return (
    <div>
      <p style={{ marginBottom: 8 }}>
        <Link href="/kifu">← 牌譜一覧</Link>
      </p>
      <h1 style={{ fontSize: 18 }}>
        牌譜 <small style={{ color: "#999" }}>#{id}</small>
      </h1>
      <p style={{ color: "#888", fontSize: 13 }}>
        撮影: {kifu.capturedAt} ／ 赤枠は「要確認」（confidence 低 or 読み取り失敗）
      </p>
      <KifuBoard kifu={kifu} />
    </div>
  );
}
