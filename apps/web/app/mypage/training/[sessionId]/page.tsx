import { notFound, redirect } from "next/navigation";
import { TrainingSessionScreen } from "../../../../components/mypage/TrainingSessionScreen";
import { getQuizSession } from "../../../../lib/api-server";
import { getSessionToken } from "../../../../lib/session";

// 本人専用ページ（成績は本人のみ閲覧可）。検索結果に載せない。
export const metadata = {
  title: "特訓の記録",
  robots: { index: false },
};

/** 特訓セッション詳細（本人のみ）。有料は保存された見直しレコードを表示する。 */
export default async function TrainingSessionPage({
  params,
}: {
  params: Promise<{ sessionId: string }>;
}) {
  const token = await getSessionToken();
  if (!token) redirect("/login");

  const { sessionId } = await params;
  // 通信・API 障害は catch せず Next のエラーバウンダリへ（404 と混同させない。
  // getQuizSession が null を返すのは本当の 404 だけ）。
  const session = await getQuizSession(token, sessionId);
  if (!session) notFound();
  return <TrainingSessionScreen session={session} />;
}
