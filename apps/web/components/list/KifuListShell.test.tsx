import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { AuthProvider } from "../../lib/auth-context";
import { KifuListShell } from "./KifuListShell";

// next/navigation の useRouter をスタブ。
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));

describe("KifuListShell", () => {
  it("マイページ/公開牌譜 のタブを表示する", async () => {
    render(
      <AuthProvider>
        <KifuListShell />
      </AuthProvider>,
    );
    expect(await screen.findByText("マイページ")).toBeTruthy();
    expect(screen.getByText("公開牌譜")).toBeTruthy();
  });

  it("未ログインのマイページはログイン導線を出す", async () => {
    render(
      <AuthProvider>
        <KifuListShell />
      </AuthProvider>,
    );
    expect(await screen.findByText(/ログイン/)).toBeTruthy();
  });
});
