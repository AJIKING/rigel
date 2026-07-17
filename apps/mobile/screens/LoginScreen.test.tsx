// ログイン画面: Sign in with Apple（iOS。App Store 審査要件 4.8）の結線を固定する。
// 純正ボタン押下 → signInAsync の identityToken/authorizationCode でサーバ認証に渡ること。

import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { LoginScreen } from "./LoginScreen";

jest.mock("expo-web-browser", () => ({ maybeCompleteAuthSession: jest.fn() }));
jest.mock("expo-auth-session/providers/google", () => ({
  useIdTokenAuthRequest: () => [null, null, jest.fn()],
}));

const mockSignInAsync = jest.fn();
jest.mock("expo-apple-authentication", () => {
  const { Pressable: P } = jest.requireActual("react-native");
  return {
    signInAsync: (...a: unknown[]) => mockSignInAsync(...a),
    AppleAuthenticationScope: { EMAIL: 1 },
    AppleAuthenticationButtonType: { SIGN_IN: 0 },
    AppleAuthenticationButtonStyle: { WHITE: 1 },
    AppleAuthenticationButton: ({ onPress }: { onPress: () => void }) => (
      <P accessibilityRole="button" accessibilityLabel="Appleでサインイン" onPress={onPress} />
    ),
  };
});

const mockSignInWithApple = jest.fn((_idToken: string, _code?: string) => Promise.resolve());
jest.mock("../lib/auth", () => ({
  useAuth: () => ({
    signInWithGoogle: jest.fn(),
    signInWithApple: (...a: unknown[]) => mockSignInWithApple(...(a as [string, string?])),
  }),
}));

describe("LoginScreen の Sign in with Apple", () => {
  beforeEach(() => jest.clearAllMocks());

  it("Apple ボタン押下で identityToken と authorizationCode をサーバ認証へ渡す", async () => {
    mockSignInAsync.mockResolvedValue({
      identityToken: "apple-id-token",
      authorizationCode: "apple-code",
    });
    render(<LoginScreen />);

    fireEvent.press(screen.getByLabelText("Appleでサインイン"));

    await waitFor(() =>
      expect(mockSignInWithApple).toHaveBeenCalledWith("apple-id-token", "apple-code"),
    );
  });

  it("キャンセル（例外）では何も起きない", async () => {
    mockSignInAsync.mockRejectedValue({ code: "ERR_REQUEST_CANCELED" });
    render(<LoginScreen />);

    fireEvent.press(screen.getByLabelText("Appleでサインイン"));

    await waitFor(() => expect(mockSignInAsync).toHaveBeenCalled());
    expect(mockSignInWithApple).not.toHaveBeenCalled();
  });
});
