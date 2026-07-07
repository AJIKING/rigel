"use client";

import { KifuListShell } from "../../components/list/KifuListShell";

/** 公開牌譜の一覧（ログイン不要）。自分の牌譜はマイページ /mypage。 */
export default function KifuListPage() {
  return <KifuListShell view="public" />;
}
