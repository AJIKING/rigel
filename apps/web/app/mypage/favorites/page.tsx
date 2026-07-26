import { ProblemSchema } from "@rigel/schema";
import { redirect } from "next/navigation";
import { MyFavoritesScreen } from "../../../components/mypage/MyFavoritesScreen";
import { listMyFavorites } from "../../../lib/api-server";
import { getSessionToken } from "../../../lib/session";

// 本人専用ページ。検索結果に載せない。
export const metadata = {
  title: "マイページ（お気に入り）",
  robots: { index: false },
};

/** マイページ（お気に入りタブ）。自分が付けた★を牌譜・何切るまたぎで一覧する・要ログイン。 */
export default async function MyPageFavoritesPage() {
  const token = await getSessionToken();
  if (!token) redirect("/login");

  // 取得失敗を「0件」に化けさせない（空状態の案内を出すと通信失敗に気づけない）。
  const loaded = await listMyFavorites(token).then(
    (r) => ({ ok: true as const, ...r }),
    () => ({ ok: false as const, games: [], problems: [] }),
  );
  // 信頼ゲート: 検証を通っていない問題データを画面へ流さない（壊れた1件はスキップ）。
  const safeProblems = loaded.problems.flatMap((p) => {
    const parsed = ProblemSchema.safeParse(p.problem);
    return parsed.success ? [{ ...p, problem: parsed.data }] : [];
  });
  return (
    <MyFavoritesScreen
      initialGames={loaded.games}
      initialProblems={safeProblems}
      loadFailed={!loaded.ok}
    />
  );
}
