import { KifuListShell } from "../../components/list/KifuListShell";

// 公開牌譜の一覧（SEO対象）。一覧本体はクライアントの KifuListShell が担う。
export const metadata = {
  title: "みんなの牌譜",
  description: "みんなが共有した麻雀の牌譜を新着順で。ブラウザでそのまま再生できます。",
  alternates: { canonical: "/kifu" },
};

/** 公開牌譜の一覧（ログイン不要）。自分の牌譜はマイページ /mypage。 */
export default function KifuListPage() {
  return <KifuListShell view="public" />;
}
