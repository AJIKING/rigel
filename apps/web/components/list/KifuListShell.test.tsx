import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { AuthProvider } from "../../lib/auth-context";
import { KifuListShell } from "./KifuListShell";

// next/navigation の useRouter をスタブ。
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));

describe("KifuListShell", () => {
  it("マイページ/公開牌譜 のタブがある", async () => {
    render(
      <AuthProvider>
        <KifuListShell />
      </AuthProvider>,
    );
    expect(await screen.findByRole("button", { name: "マイページ" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "公開牌譜" })).toBeTruthy();
  });

  it("未ログインでマイページタブを開くとログイン導線が出る", async () => {
    render(
      <AuthProvider>
        <KifuListShell />
      </AuthProvider>,
    );
    fireEvent.click(await screen.findByRole("button", { name: "マイページ" }));
    expect(await screen.findByText(/ログイン/)).toBeTruthy();
  });
});
