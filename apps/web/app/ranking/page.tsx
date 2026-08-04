import { QUIZ_KINDS } from "@rigel/ui";
import { RankingScreen } from "../../components/ranking/RankingScreen";
import { getQuizRanking } from "../../lib/api-server";
import { getSessionToken } from "../../lib/session";

// 公開ページ（verified セッションの集計値と常時公開のプロフィール情報のみ）。
export const metadata = {
  title: "特訓ランキング | RAISHA",
  description: "60秒特訓の週間・月間・全期間ランキング。正解数と正答率で競える。",
};

// 集計はリクエスト時に行う（ビルド時に固めない）。
export const dynamic = "force-dynamic";

/** 特訓ランキング（匿名可）。初期表示は先頭種目×週間。チップ切替はクライアント側で再取得。 */
export default async function RankingPage() {
  const token = await getSessionToken();
  // 初期取得に失敗しても殻は出す（null を渡す＝画面はエラー文言を出し、チップ操作で
  // 再取得できる。空データに偽装して「まだ記録がありません」と誤読させない）。
  const initial = await getQuizRanking(QUIZ_KINDS[0]!, "weekly", token ?? undefined).catch(
    () => null,
  );
  return <RankingScreen initial={initial} />;
}
