import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { AuthProvider } from "../../lib/auth-context";
import { SettingsShell } from "./SettingsShell";
import { UserPageShell } from "./UserPageShell";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));

describe("SettingsShell", () => {
  it("未ログインではログイン導線を出す", async () => {
    render(
      <AuthProvider>
        <SettingsShell />
      </AuthProvider>,
    );
    // 本文の案内（ヘッダーのログインボタンと区別するため固有の文言で確認）。
    expect(await screen.findByText(/設定を開くには/)).toBeTruthy();
  });
});

describe("UserPageShell", () => {
  it("取得できないユーザーは非公開/不在の案内を出す", async () => {
    render(
      <AuthProvider>
        <UserPageShell idOrHandle="nobody" />
      </AuthProvider>,
    );
    expect(await screen.findByText(/非公開/)).toBeTruthy();
  });
});
