"use client";

import Link from "next/link";
import s from "../list/kifu-list.module.css";

/** マイページのタブ。「お気に入り」は牌譜・何切るをまたいだ自分の★（[決定] 2026-07-26）。 */
const TABS = [
  { key: "kifu", href: "/mypage", label: "牌譜" },
  { key: "problems", href: "/mypage/problems", label: "何切る" },
  { key: "favorites", href: "/mypage/favorites", label: "お気に入り" },
  { key: "training", href: "/mypage/training", label: "特訓" },
] as const;

export type MyPageTabKey = (typeof TABS)[number]["key"];

export function MyPageTabs({ active }: { active: MyPageTabKey }) {
  return (
    <nav className={s.mypageTabs} aria-label="マイページの切替">
      {/* 現在地は色（s.on）に加えて aria-current="page" で支援技術にも伝える。 */}
      {TABS.map((tab) => (
        <Link
          key={tab.key}
          href={tab.href}
          className={active === tab.key ? s.on : ""}
          aria-current={active === tab.key ? "page" : undefined}
        >
          {tab.label}
        </Link>
      ))}
    </nav>
  );
}
