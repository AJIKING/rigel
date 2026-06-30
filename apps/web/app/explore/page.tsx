"use client";

import { KifuListShell } from "../../components/list/KifuListShell";

/** 公開牌譜の一覧（ログイン不要）。マイページは /kifu。 */
export default function ExplorePage() {
  return <KifuListShell view="public" />;
}
