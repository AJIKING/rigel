import { ProblemListScreen } from "../../components/problem/ProblemListScreen";
import { getPublicProblems } from "../../lib/api-server";
import { normalizeProblemPosts } from "../../lib/problems";

// 何切るの公開一覧（SEO対象）。
export const metadata = {
  title: "みんなの何切る",
  description: "みんなが投稿した何切る問題。回答するとみんなの回答分布と比べられます。",
  alternates: { canonical: "/problems" },
};

// 何切るの公開一覧（published のみ・新着順）。認証不要で SSR する。
export default async function ProblemsPage() {
  const raw = await getPublicProblems().catch(() => []);
  return <ProblemListScreen posts={normalizeProblemPosts(raw)} />;
}
