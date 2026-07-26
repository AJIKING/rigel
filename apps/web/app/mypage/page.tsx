import { MyKifuScreen } from "../../components/list/MyKifuScreen";

// 本人専用ページ。検索結果に載せない。
export const metadata = {
  title: "マイページ",
  robots: { index: false },
};

/** マイページ（牌譜タブ）。自分の牌譜一覧・要ログイン。何切るタブは /mypage/problems。 */
export default function MyPageKifuPage() {
  return <MyKifuScreen />;
}
