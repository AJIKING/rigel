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

describe("AppHeader", () => {
  it("未ログイン: 公開牌譜のみ＋ログインボタン（マイページ/アバター無し）", () => {
    auth.user = null;
    render(<AppHeader active="public" />);
    expect(screen.getByRole("link", { name: "公開牌譜" })).toBeTruthy();
    expect(screen.queryByRole("link", { name: "マイページ" })).toBeNull();
    expect(screen.getByRole("link", { name: "ログイン" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "設定" })).toBeNull();
  });

  it("ログイン中: マイページ＋公開牌譜＋設定アバター（ログイン導線無し）", () => {
    auth.user = { id: "u1", plan: "free", displayName: "Rin" };
    render(<AppHeader active="mine" />);
    expect(screen.getByRole("link", { name: "マイページ" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "公開牌譜" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "設定" })).toBeTruthy();
    expect(screen.queryByRole("link", { name: "ログイン" })).toBeNull();
  });
});
