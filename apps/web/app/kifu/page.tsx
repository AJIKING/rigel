import Link from "next/link";

// 保存済み牌譜の一覧（土台）。実データは D1 から取得する（保存/閲覧は今後）。
// いまはサンプル1件を出してナビゲーションを示す。
const items = [{ id: "sample", title: "サンプル対局", capturedAt: "2026-06-28" }];

export default function KifuListPage() {
  return (
    <div>
      <h1>牌譜一覧</h1>
      {items.length === 0 ? (
        <p style={{ color: "#888" }}>
          まだ牌譜がありません。アプリで卓を撮影して作成してください。
        </p>
      ) : (
        <ul style={{ listStyle: "none", padding: 0 }}>
          {items.map((item) => (
            <li key={item.id} style={{ borderBottom: "1px solid #eee", padding: "10px 0" }}>
              <Link href={`/kifu/${item.id}`} style={{ textDecoration: "none", color: "#222" }}>
                <strong>{item.title}</strong>{" "}
                <small style={{ color: "#999" }}>{item.capturedAt}</small>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
