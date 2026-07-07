import { notFound } from "next/navigation";
import { ProblemAnswerScreen } from "../../../components/problem/ProblemAnswerScreen";
import { getProblem } from "../../../lib/api-server";
import { normalizeProblemPost } from "../../../lib/problems";
import { getSessionToken } from "../../../lib/session";

// 何切る問題の回答ページ（共有URL単位）。published は認証不要で SSR、
// draft は Cookie セッションの所有者だけ開ける（他人には 404 = 存在を伏せる）。
export default async function ProblemPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const token = (await getSessionToken()) ?? undefined;
  const post = await getProblem(id, token).catch(() => null);
  if (!post) notFound();
  return <ProblemAnswerScreen post={normalizeProblemPost(post)} />;
}
