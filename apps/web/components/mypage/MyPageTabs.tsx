"use client";

import Link from "next/link";
import s from "../list/kifu-list.module.css";

/** マイページのタブ（牌譜 / 何切る）。/mypage と /mypage/problems を切り替える。 */
export function MyPageTabs({ active }: { active: "kifu" | "problems" }) {
  return (
    <nav className={s.mypageTabs} aria-label="マイページの切替">
      <Link href="/mypage" className={active === "kifu" ? s.on : ""}>
        牌譜
      </Link>
      <Link href="/mypage/problems" className={active === "problems" ? s.on : ""}>
        何切る
      </Link>
    </nav>
  );
}
