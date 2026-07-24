import { redirect } from "next/navigation";
import { MyTrainingScreen } from "../../../components/mypage/MyTrainingScreen";
import { listQuizSessions } from "../../../lib/api-server";
import { getSessionToken } from "../../../lib/session";

// 本人専用ページ（成績は本人のみ閲覧可）。検索結果に載せない。
export const metadata = {
  title: "マイページ（特訓）",
  robots: { index: false },
};

/** マイページ（特訓タブ）。自分の特訓クイズ履歴とグラフ・要ログイン。 */
export default async function MyPageTrainingPage() {
  const token = await getSessionToken();
  if (!token) redirect("/login");

  const sessions = await listQuizSessions(token).catch(() => []);
  return <MyTrainingScreen initialSessions={sessions} />;
}
