import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const signInWithApple = vi.fn(() => Promise.resolve());
vi.mock("../lib/auth-context", () => ({
  useAuth: () => ({ signInWithApple }),
}));

async function importButton() {
  vi.resetModules();
  return (await import("./AppleSignInButton")).AppleSignInButton;
}

describe("AppleSignInButton", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    delete (window as { AppleID?: unknown }).AppleID;
    signInWithApple.mockClear();
  });

  it("NEXT_PUBLIC_APPLE_CLIENT_ID 未設定なら何も描画しない（Google のみ＝従来どおり）", async () => {
    vi.stubEnv("NEXT_PUBLIC_APPLE_CLIENT_ID", "");
    const AppleSignInButton = await importButton();
    const { container } = render(<AppleSignInButton />);
    expect(container.querySelector("button")).toBeNull();
  });

  it("ポップアップで得た id_token と authorizationCode でサインインする", async () => {
    vi.stubEnv("NEXT_PUBLIC_APPLE_CLIENT_ID", "jp.co.plaria.rigel.web");
    const init = vi.fn();
    window.AppleID = {
      auth: {
        init,
        signIn: () =>
          Promise.resolve({ authorization: { id_token: "apple-id-token", code: "apple-code" } }),
      },
    };
    const AppleSignInButton = await importButton();
    render(<AppleSignInButton />);

    fireEvent.click(screen.getByRole("button", { name: /Apple/ }));

    await waitFor(() =>
      expect(signInWithApple).toHaveBeenCalledWith("apple-id-token", "apple-code"),
    );
    // Services ID とポップアップモードで初期化している。
    expect(init).toHaveBeenCalledWith(
      expect.objectContaining({ clientId: "jp.co.plaria.rigel.web", usePopup: true }),
    );
  });

  it("ポップアップを閉じた（キャンセル）はエラー表示しない", async () => {
    vi.stubEnv("NEXT_PUBLIC_APPLE_CLIENT_ID", "jp.co.plaria.rigel.web");
    window.AppleID = {
      auth: {
        init: vi.fn(),
        signIn: () => Promise.reject({ error: "popup_closed_by_user" }),
      },
    };
    const AppleSignInButton = await importButton();
    render(<AppleSignInButton />);
    fireEvent.click(screen.getByRole("button", { name: /Apple/ }));
    await waitFor(() => expect(screen.queryByRole("alert")).toBeNull());
    expect(signInWithApple).not.toHaveBeenCalled();
  });
});
