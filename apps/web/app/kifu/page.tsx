"use client";

import { KifuListShell } from "../../components/list/KifuListShell";

/** マイページ（自分の牌譜一覧・要ログイン）。公開牌譜は /explore。 */
export default function KifuListPage() {
  return <KifuListShell view="mine" />;
}
