import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { AppHeader } from "./AppHeader";

// useAuth を差し替えてログイン状態を制御する。
const auth: {
  user: { id: string; plan: string; displayName?: string; handle?: string } | null;
  loading: boolean;
} = { user: null, loading: false };
vi.mock("../lib/auth-context", () => ({ useAuth: () => auth }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));

describe("AppHeader（ナビは 牌譜・何切る・マイページ）", () => {
  it("未ログイン: 牌譜・何切る＋ログインボタン（マイページ/アバター無し）", () => {
    auth.user = null;
    render(<AppHeader active="kifu" />);
    expect(screen.getByRole("link", { name: "牌譜" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "何切る" })).toBeTruthy();
    expect(screen.queryByRole("link", { name: "マイページ" })).toBeNull();
    expect(screen.getByRole("link", { name: "ログイン" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "設定" })).toBeNull();
  });

  it("ログイン中: 牌譜・何切る・マイページ＋設定アバター（ログイン導線無し）", () => {
    auth.user = { id: "u1", plan: "free", displayName: "Rin" };
    render(<AppHeader active="mypage" />);
    expect(screen.getByRole("link", { name: "牌譜" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "何切る" })).toBeTruthy();
    const mypage = screen.getByRole("link", { name: "マイページ" });
    expect(mypage.getAttribute("href")).toBe("/mypage");
    expect(screen.getByRole("button", { name: "設定" })).toBeTruthy();
    expect(screen.queryByRole("link", { name: "ログイン" })).toBeNull();
  });

  it("リンク先: 牌譜=/kifu（公開一覧）・何切る=/problems", () => {
    auth.user = null;
    render(<AppHeader />);
    expect(screen.getByRole("link", { name: "牌譜" }).getAttribute("href")).toBe("/kifu");
    expect(screen.getByRole("link", { name: "何切る" }).getAttribute("href")).toBe("/problems");
  });
});
