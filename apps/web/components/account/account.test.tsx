import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { AuthProvider } from "../../lib/auth-context";
import { SettingsShell } from "./SettingsShell";
import { UserPageShell } from "./UserPageShell";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
// Server Action は server-only を辿るためモック（未ログインなので呼ばれない）。
vi.mock("../../app/actions", () => ({
  createCheckoutAction: vi.fn(),
  createPortalAction: vi.fn(),
  deleteAccountAction: vi.fn(),
  updateProfileAction: vi.fn(),
}));

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
  it("不在ユーザー（404）は非公開/不在の案内を出す", async () => {
    // プロフィールは 404・/api/me は未ログイン、を返すスタブ。
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes("/profile")) return { ok: false, status: 404 };
        return { ok: true, status: 200, json: async () => ({ user: null }) };
      }),
    );
    try {
      render(
        <AuthProvider>
          <UserPageShell idOrHandle="nobody" />
        </AuthProvider>,
      );
      expect(await screen.findByText(/非公開/)).toBeTruthy();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("通信失敗は「不在（非公開）」に化けさせず、読み込み失敗の理由を出す", async () => {
    // fetch をスタブしない＝jsdom では実ネットワークに出られず reject する。
    render(
      <AuthProvider>
        <UserPageShell idOrHandle="nobody" />
      </AuthProvider>,
    );
    expect(await screen.findByText(/読み込めませんでした/)).toBeTruthy();
    expect(screen.queryByText(/非公開/)).toBeNull();
  });
});
