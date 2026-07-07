import { notFound, redirect } from "next/navigation";
import { ProblemEditorScreen } from "../../../../components/problem/ProblemEditorScreen";
import { fetchMe, getProblem } from "../../../../lib/api-server";
import { normalizeProblemPost } from "../../../../lib/problems";
import { getSessionToken } from "../../../../lib/session";

// 何切る問題の編集。所有者のみ（他人の問題は公開でも編集画面を開かせない=404）。
export default async function EditProblemPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const token = await getSessionToken();
  if (!token) redirect("/login");

  const [post, me] = await Promise.all([
    getProblem(id, token).catch(() => null),
    fetchMe(token).catch(() => null),
  ]);
  if (!post || !me || post.userId !== me.id) notFound();
  return <ProblemEditorScreen initial={normalizeProblemPost(post)} />;
}
