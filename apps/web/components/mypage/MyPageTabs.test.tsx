import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { MyPageTabs } from "./MyPageTabs";

describe("MyPageTabs（マイページの牌譜/何切る/特訓タブ）", () => {
  it("リンク先: 牌譜=/mypage・何切る=/mypage/problems・特訓=/mypage/training", () => {
    render(<MyPageTabs active="kifu" />);
    expect(screen.getByRole("link", { name: "牌譜" }).getAttribute("href")).toBe("/mypage");
    expect(screen.getByRole("link", { name: "何切る" }).getAttribute("href")).toBe(
      "/mypage/problems",
    );
    expect(screen.getByRole("link", { name: "特訓" }).getAttribute("href")).toBe(
      "/mypage/training",
    );
  });

  // 現在地は色（s.on）だけでなく aria-current="page" でも支援技術へ伝える。
  it.each([
    ["kifu", "牌譜"],
    ["problems", "何切る"],
    ["training", "特訓"],
  ] as const)(
    "active=%s: 「%s」に aria-current=page が付き、他のタブには付かない",
    (active, label) => {
      render(<MyPageTabs active={active} />);
      expect(screen.getByRole("link", { name: label }).getAttribute("aria-current")).toBe("page");
      for (const other of ["牌譜", "何切る", "特訓"].filter((n) => n !== label)) {
        expect(screen.getByRole("link", { name: other }).getAttribute("aria-current")).toBeNull();
      }
    },
  );
});
