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
    expect(await screen.findByText(/ログイン/)).toBeTruthy();
  });
});

describe("UserPageShell", () => {
  it("取得できないユーザーは非公開/不在の案内を出す", async () => {
    render(<UserPageShell idOrHandle="nobody" />);
    expect(await screen.findByText(/非公開/)).toBeTruthy();
  });
});
