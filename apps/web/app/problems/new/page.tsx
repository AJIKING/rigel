import { redirect } from "next/navigation";
import { ProblemEditorScreen } from "../../../components/problem/ProblemEditorScreen";
import { getSessionToken } from "../../../lib/session";

// 作成画面は本人専用。検索結果に載せない。
export const metadata = {
  title: "何切るを作成",
  robots: { index: false },
};

// 何切る問題の新規作成。要ログイン（保存時に上限判定は API 側でも行う）。
export default async function NewProblemPage() {
  const token = await getSessionToken();
  if (!token) redirect("/login");
  return <ProblemEditorScreen />;
}
