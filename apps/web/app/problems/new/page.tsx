import { redirect } from "next/navigation";
import { ProblemEditorScreen } from "../../../components/problem/ProblemEditorScreen";
import { getSessionToken } from "../../../lib/session";

// 作成画面は本人専用。検索結果に載せない。
export const metadata = {
  title: "何切るを作成",
  robots: { index: false },
};

// 何切る問題の新規作成。要ログイン（保存時に上限判定は API 側でも行う）。
// ?draft={id} で解析下書き（photo-retention.md）から開く（結果の流し込みはクライアント側）。
export default async function NewProblemPage({
  searchParams,
}: {
  searchParams: Promise<{ draft?: string }>;
}) {
  const token = await getSessionToken();
  if (!token) redirect("/login");
  const { draft } = await searchParams;
  return <ProblemEditorScreen draftId={typeof draft === "string" ? draft : undefined} />;
}
