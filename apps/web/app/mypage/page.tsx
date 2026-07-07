"use client";

import { KifuListShell } from "../../components/list/KifuListShell";

/** マイページ（牌譜タブ）。自分の牌譜一覧・要ログイン。何切るタブは /mypage/problems。 */
export default function MyPageKifuPage() {
  return <KifuListShell view="mine" />;
}
