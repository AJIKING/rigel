"use client";

import Link from "next/link";
import s from "../list/kifu-list.module.css";

/** マイページのタブ（牌譜 / 何切る / 特訓）。/mypage・/mypage/problems・/mypage/training を切り替える。 */
export function MyPageTabs({ active }: { active: "kifu" | "problems" | "training" }) {
  return (
    <nav className={s.mypageTabs} aria-label="マイページの切替">
      {/* 現在地は色（s.on）に加えて aria-current="page" で支援技術にも伝える。 */}
      <Link
        href="/mypage"
        className={active === "kifu" ? s.on : ""}
        aria-current={active === "kifu" ? "page" : undefined}
      >
        牌譜
      </Link>
      <Link
        href="/mypage/problems"
        className={active === "problems" ? s.on : ""}
        aria-current={active === "problems" ? "page" : undefined}
      >
        何切る
      </Link>
      <Link
        href="/mypage/training"
        className={active === "training" ? s.on : ""}
        aria-current={active === "training" ? "page" : undefined}
      >
        特訓
      </Link>
    </nav>
  );
}
