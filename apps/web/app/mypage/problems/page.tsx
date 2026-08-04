import { redirect } from "next/navigation";
import { MyProblemsScreen } from "../../../components/problem/MyProblemsScreen";
import { getMyProblems } from "../../../lib/api-server";
import { normalizeProblemPosts } from "../../../lib/problems";
import { getSessionToken } from "../../../lib/session";

// 本人専用ページ。検索結果に載せない。
export const metadata = {
  title: "マイページ（何切る）",
  robots: { index: false },
};

/** マイページ（何切るタブ）。自分の問題の管理（draft 含む）・要ログイン。 */
export default async function MyPageProblemsPage() {
  const token = await getSessionToken();
  if (!token) redirect("/login");

  // 取得失敗を「0件」に化けさせない（空状態の案内を出すと通信失敗に気づけない）。
  const loaded = await getMyProblems(token).then(
    (r) => ({ ok: true as const, posts: r.items, nextCursor: r.nextCursor }),
    () => ({ ok: false as const, posts: [], nextCursor: null }),
  );
  return (
    <MyProblemsScreen
      initialPosts={normalizeProblemPosts(loaded.posts)}
      initialCursor={loaded.nextCursor}
      loadFailed={!loaded.ok}
    />
  );
}
