import { PublicKifuScreen } from "../../components/list/PublicKifuScreen";
import { getPublicGames } from "../../lib/api-server";

// 公開牌譜の一覧（SEO対象）。
export const metadata = {
  title: "みんなの牌譜",
  description: "みんなが共有した麻雀の牌譜を新着順で。ブラウザでそのまま再生できます。",
  alternates: { canonical: "/kifu" },
};
// **リクエストごとにサーバーで描く**（[決定] 2026-07-26）。静的プリレンダーだと
// ビルド時（CI・API 未起動）の取得結果が HTML に焼き付き、公開後もずっと
// 「読み込めませんでした」や空一覧を返し続ける。フィードは常に最新を出す必要もある。
// SEO は SSR で満たせる（クローラには描画済み HTML が届く）。
export const dynamic = "force-dynamic";

/**
 * 公開牌譜の一覧（ログイン不要）。自分の牌譜はマイページ /mypage。
 * **カードはサーバーで描く**（[決定] 2026-07-26）: SEO 対象なのでクライアント取得だと
 * 初回 HTML が空になりクローラに中身が届かない（/problems と同じ形に揃えた）。
 */
export default async function KifuListPage() {
  // 取得失敗を「0件」に化けさせない（空状態の案内を出すと通信失敗に気づけない）。
  const loaded = await getPublicGames().then(
    (games) => ({ ok: true as const, games }),
    () => ({ ok: false as const, games: [] }),
  );
  return <PublicKifuScreen games={loaded.games} loadFailed={!loaded.ok} />;
}
