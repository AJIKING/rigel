import { ProblemListScreen } from "../../components/problem/ProblemListScreen";
import { getPublicProblems } from "../../lib/api-server";
import { normalizeProblemPosts } from "../../lib/problems";

// 何切るの公開一覧（published のみ・新着順）。認証不要で SSR する。
export default async function ProblemsPage() {
  const raw = await getPublicProblems().catch(() => []);
  return <ProblemListScreen posts={normalizeProblemPosts(raw)} />;
}
