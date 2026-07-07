import { redirect } from "next/navigation";
import { MyProblemsScreen } from "../../../components/problem/MyProblemsScreen";
import { getMyProblems } from "../../../lib/api-server";
import { normalizeProblemPosts } from "../../../lib/problems";
import { getSessionToken } from "../../../lib/session";

/** マイページ（何切るタブ）。自分の問題の管理（draft 含む）・要ログイン。 */
export default async function MyPageProblemsPage() {
  const token = await getSessionToken();
  if (!token) redirect("/login");

  const raw = await getMyProblems(token).catch(() => []);
  return <MyProblemsScreen initialPosts={normalizeProblemPosts(raw)} />;
}
