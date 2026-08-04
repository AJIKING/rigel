import { ProblemListScreen } from "../../components/problem/ProblemListScreen";
import { getPublicProblems } from "../../lib/api-server";
import { normalizeProblemPosts } from "../../lib/problems";

// 何切るの公開一覧（SEO対象）。
export const metadata = {
  title: "みんなの何切る",
  description: "みんなが投稿した何切る問題。回答するとみんなの回答分布と比べられます。",
  alternates: { canonical: "/problems" },
};
// **リクエストごとにサーバーで描く**（[決定] 2026-07-26）。静的プリレンダーだと
// ビルド時（CI・API 未起動）の取得結果が HTML に焼き付き、公開後もずっと
// 「読み込めませんでした」や空一覧を返し続ける。フィードは常に最新を出す必要もある。
// SEO は SSR で満たせる（クローラには描画済み HTML が届く）。
export const dynamic = "force-dynamic";

// 何切るの公開一覧（published のみ・新着順・カーソル方式の1ページ目）。認証不要で SSR する。
export default async function ProblemsPage() {
  // 取得失敗を「0件」に化けさせない（空状態の案内を出すと通信失敗に気づけない）。
  const loaded = await getPublicProblems().then(
    (r) => ({ ok: true as const, page: r }),
    () => ({ ok: false as const, page: { items: [], nextCursor: null } }),
  );
  return (
    <ProblemListScreen
      initialPosts={normalizeProblemPosts(loaded.page.items)}
      initialCursor={loaded.page.nextCursor}
      loadFailed={!loaded.ok}
    />
  );
}
