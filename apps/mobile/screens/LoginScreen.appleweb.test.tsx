// ログイン画面（Android）: Sign in with Apple の web フロー結線を固定する。
// 自前ボタン押下 → authorize URL を Custom Tabs で開き、中継コールバックの
// id_token/code を state 照合のうえサーバ認証に渡すこと（設計判断は
// docs/plans/android.md §12-B。iOS で Apple 登録した人が Android でも同じアカウントに入れる）。

import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { Platform } from "react-native";
import { APPLE_REDIRECT_URL } from "../lib/apple-login";
import { LoginScreen } from "./LoginScreen";

const mockOpenAuthSession = jest.fn();
jest.mock("expo-web-browser", () => ({
  maybeCompleteAuthSession: jest.fn(),
  openAuthSessionAsync: (...a: unknown[]) => mockOpenAuthSession(...a),
}));
jest.mock("expo-auth-session/providers/google", () => ({
  useIdTokenAuthRequest: () => [null, null, jest.fn()],
}));
// state はテストで固定（実装は expo-crypto の randomUUID を使う）。
jest.mock("expo-crypto", () => ({ randomUUID: () => "state-1" }));
jest.mock("expo-apple-authentication", () => ({
  AppleAuthenticationScope: { EMAIL: 1 },
  AppleAuthenticationButtonType: { SIGN_IN: 0 },
  AppleAuthenticationButtonStyle: { WHITE: 1 },
  AppleAuthenticationButton: () => null,
  signInAsync: jest.fn(),
}));

const mockSignInWithApple = jest.fn((_idToken: string, _code?: string) => Promise.resolve());
jest.mock("../lib/auth", () => ({
  useAuth: () => ({
    signInWithGoogle: jest.fn(),
    signInWithApple: (...a: unknown[]) => mockSignInWithApple(...(a as [string, string?])),
  }),
}));

describe("LoginScreen（Android）の Sign in with Apple（web フロー）", () => {
  const originalOs = Platform.OS;
  beforeAll(() => {
    Object.defineProperty(Platform, "OS", { value: "android", configurable: true });
    process.env.EXPO_PUBLIC_APPLE_CLIENT_ID = "jp.co.plaria.rigel.web";
    process.env.EXPO_PUBLIC_API_URL = "https://api.example.com";
  });
  afterAll(() => {
    Object.defineProperty(Platform, "OS", { value: originalOs, configurable: true });
    delete process.env.EXPO_PUBLIC_APPLE_CLIENT_ID;
    delete process.env.EXPO_PUBLIC_API_URL;
  });
  beforeEach(() => jest.clearAllMocks());

  it("ボタン押下で authorize URL を開き、コールバックの id_token/code をサーバ認証へ渡す", async () => {
    mockOpenAuthSession.mockResolvedValue({
      type: "success",
      url: `${APPLE_REDIRECT_URL}?id_token=web-apple-token&code=web-code&state=state-1`,
    });
    render(<LoginScreen />);

    fireEvent.press(screen.getByLabelText("Appleでサインイン"));

    await waitFor(() =>
      expect(mockSignInWithApple).toHaveBeenCalledWith("web-apple-token", "web-code"),
    );
    const [authUrl, redirect] = mockOpenAuthSession.mock.calls[0] as [string, string];
    expect(authUrl).toContain("https://appleid.apple.com/auth/authorize?");
    expect(authUrl).toContain("client_id=jp.co.plaria.rigel.web");
    expect(redirect).toBe(APPLE_REDIRECT_URL);
  });

  it("state 不一致（別セッションの応答）はサーバ認証へ渡さない", async () => {
    mockOpenAuthSession.mockResolvedValue({
      type: "success",
      url: `${APPLE_REDIRECT_URL}?id_token=web-apple-token&state=other`,
    });
    render(<LoginScreen />);

    fireEvent.press(screen.getByLabelText("Appleでサインイン"));

    await waitFor(() => expect(mockOpenAuthSession).toHaveBeenCalled());
    expect(mockSignInWithApple).not.toHaveBeenCalled();
  });

  it("キャンセル（dismiss）では何も起きない", async () => {
    mockOpenAuthSession.mockResolvedValue({ type: "dismiss" });
    render(<LoginScreen />);

    fireEvent.press(screen.getByLabelText("Appleでサインイン"));

    await waitFor(() => expect(mockOpenAuthSession).toHaveBeenCalled());
    expect(mockSignInWithApple).not.toHaveBeenCalled();
  });
});
