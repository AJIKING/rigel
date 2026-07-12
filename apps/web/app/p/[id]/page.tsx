import { notFound } from "next/navigation";
import { cache } from "react";
import { ProblemAnswerScreen } from "../../../components/problem/ProblemAnswerScreen";
import { getProblem } from "../../../lib/api-server";
import { buildProblemMetadata } from "../../../lib/og-meta";
import { normalizeProblemPost } from "../../../lib/problems";
import { getSessionToken } from "../../../lib/session";

// generateMetadata とページ本体で同一リクエスト内のフェッチを共有する（/k と同じ流儀）。
const getPost = cache(async (id: string) => {
  const token = (await getSessionToken()) ?? undefined;
  return getProblem(id, token).catch(() => null);
});

// 動的メタデータ: published はタイトル・説明・OGP を問題から組み立てる。
// draft は所有者のタブ表示用タイトルだけ（noindex・OGPなし）、不存在は既定へフォールバック。
export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return buildProblemMetadata(await getPost(id));
}

// 何切る問題の回答ページ（共有URL単位）。published は認証不要で SSR、
// draft は Cookie セッションの所有者だけ開ける（他人には 404 = 存在を伏せる）。
export default async function ProblemPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const post = await getPost(id);
  if (!post) notFound();
  return <ProblemAnswerScreen post={normalizeProblemPost(post)} />;
}
