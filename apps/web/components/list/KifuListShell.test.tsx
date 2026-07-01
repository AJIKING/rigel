import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { AuthProvider } from "../../lib/auth-context";
import { KifuListShell } from "./KifuListShell";

// next/navigation の useRouter をスタブ。
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
// Server Action は server-only を辿るためモック（未ログインなので呼ばれない）。
vi.mock("../../app/actions", () => ({ getMyGamesAction: vi.fn(() => Promise.resolve([])) }));

describe("KifuListShell", () => {
  it("公開牌譜ビューは見出しを表示する", async () => {
    render(
      <AuthProvider>
        <KifuListShell view="public" />
      </AuthProvider>,
    );
    expect(await screen.findByRole("heading", { name: "公開牌譜" })).toBeTruthy();
  });

  it("マイページビューは未ログインだとログイン導線を出す", async () => {
    render(
      <AuthProvider>
        <KifuListShell view="mine" />
      </AuthProvider>,
    );
    expect(await screen.findByText(/自分の牌譜を見るには/)).toBeTruthy();
  });

  it("未ログインのヘッダーはマイページを出さず、ログインボタンを出す", async () => {
    render(
      <AuthProvider>
        <KifuListShell view="public" />
      </AuthProvider>,
    );
    // 認証読み込みが終わるとログインボタンが出る。
    expect(await screen.findByRole("link", { name: "ログイン" })).toBeTruthy();
    expect(screen.queryByRole("link", { name: "マイページ" })).toBeNull();
  });
});
