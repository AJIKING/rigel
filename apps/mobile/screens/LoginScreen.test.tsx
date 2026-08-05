// ログイン画面: Sign in with Apple（iOS。App Store 審査要件 4.8）の結線を固定する。
// 純正ボタン押下 → signInAsync の identityToken/authorizationCode でサーバ認証に渡ること。

import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { LoginScreen } from "./LoginScreen";

const mockOpenBrowser = jest.fn((_url: string) => Promise.resolve());
jest.mock("expo-web-browser", () => ({
  maybeCompleteAuthSession: jest.fn(),
  openBrowserAsync: (...a: unknown[]) => mockOpenBrowser(...(a as [string])),
}));
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

// エラー計測（Crashlytics）はモック（キャンセルは記録せず、実エラーだけ記録する検証用）。
const mockTrackError = jest.fn();
jest.mock("../lib/crash", () => ({ trackError: (...a: unknown[]) => mockTrackError(...a) }));

const mockSignInWithApple = jest.fn((_idToken: string, _code?: string) => Promise.resolve());
const mockSignInWithReviewCode = jest.fn((_code: string) => Promise.resolve());
const mockStartGuest = jest.fn();
jest.mock("../lib/auth", () => ({
  useAuth: () => ({
    signInWithGoogle: jest.fn(),
    signInWithApple: (...a: unknown[]) => mockSignInWithApple(...(a as [string, string?])),
    signInWithReviewCode: (...a: unknown[]) => mockSignInWithReviewCode(...(a as [string])),
    startGuest: () => mockStartGuest(),
  }),
}));

describe("LoginScreen の Sign in with Apple", () => {
  beforeEach(() => jest.clearAllMocks());

  it("iOS も自前ボタン（Google ボタンと同じ書体）。押下で identityToken と authorizationCode をサーバ認証へ渡す", async () => {
    mockSignInAsync.mockResolvedValue({
      identityToken: "apple-id-token",
      authorizationCode: "apple-code",
    });
    render(<LoginScreen />);

    // 純正ボタンではなくテキスト付きの自前ボタン（フォントを Google ボタンと統一。
    // Apple のガイドライン準拠: ロゴ＋規定文言）。[決定] 2026-08-01 オーナー
    fireEvent.press(screen.getByText("Appleでサインイン"));

    await waitFor(() =>
      expect(mockSignInWithApple).toHaveBeenCalledWith("apple-id-token", "apple-code"),
    );
  });

  it("キャンセル（例外）では何も起きない（Crashlytics にも記録しない）", async () => {
    mockSignInAsync.mockRejectedValue({ code: "ERR_REQUEST_CANCELED" });
    render(<LoginScreen />);

    fireEvent.press(screen.getByText("Appleでサインイン"));

    await waitFor(() => expect(mockSignInAsync).toHaveBeenCalled());
    expect(mockSignInWithApple).not.toHaveBeenCalled();
    expect(mockTrackError).not.toHaveBeenCalled();
  });

  it("キャンセル以外の失敗は黙って戻るが、エラー本体を Crashlytics に記録する", async () => {
    mockSignInAsync.mockRejectedValue(new Error("apple native failure"));
    render(<LoginScreen />);

    fireEvent.press(screen.getByText("Appleでサインイン"));

    await waitFor(() =>
      expect(mockTrackError).toHaveBeenCalledWith(expect.any(Error), {
        screen: "login",
        op: "apple_sign_in",
      }),
    );
    expect(mockSignInWithApple).not.toHaveBeenCalled();
  });
});

describe("LoginScreen の文言とゲスト開始", () => {
  beforeEach(() => jest.clearAllMocks());

  it("「サインインしないではじめる」でゲストとして開始できる（サインイン必須のアプリではない）", () => {
    render(<LoginScreen />);

    fireEvent.press(screen.getByText("サインインしないではじめる"));

    expect(mockStartGuest).toHaveBeenCalled();
  });

  it("画面内の文言は「サインイン」に統一する（○○ とサインインの間は半角スペース）", () => {
    // Google ボタンは env があるときだけ出る（設定は描画時に読む）。
    process.env.EXPO_PUBLIC_GOOGLE_CLIENT_ID = "google-client-id";
    try {
      render(<LoginScreen />);
      expect(screen.getByText("Google でサインイン")).toBeTruthy();
      expect(screen.queryByText(/でログイン/)).toBeNull();
    } finally {
      delete process.env.EXPO_PUBLIC_GOOGLE_CLIENT_ID;
    }
  });

  it("規約文言は「サインインすると〜同意」で、利用規約・プライバシーポリシーとも web を開くリンク", async () => {
    render(<LoginScreen />);

    expect(screen.getByText(/サインインすると/)).toBeTruthy();

    fireEvent.press(screen.getByText("利用規約"));
    await waitFor(() =>
      expect(mockOpenBrowser).toHaveBeenCalledWith(expect.stringMatching(/\/terms$/)),
    );

    fireEvent.press(screen.getByText("プライバシーポリシー"));
    await waitFor(() =>
      expect(mockOpenBrowser).toHaveBeenCalledWith(expect.stringMatching(/\/privacy$/)),
    );
  });

  it("Google 未設定時の案内も「サインイン」表記", () => {
    render(<LoginScreen />);
    expect(screen.getByText(/Google サインインは未設定です/)).toBeTruthy();
  });
});

describe("LoginScreen の審査用ログイン（ストア審査員向けの合言葉。docs/plans/review-login.md 案B）", () => {
  beforeEach(() => jest.clearAllMocks());

  it("通常表示では審査コード入力欄は出ない", () => {
    render(<LoginScreen />);
    expect(screen.queryByLabelText("審査コード")).toBeNull();
  });

  it("ロゴ長押しで入力欄が現れ、送信でコードをサーバ認証へ渡す", async () => {
    render(<LoginScreen />);

    fireEvent(screen.getByTestId("review-login-trigger"), "longPress");
    fireEvent.changeText(screen.getByLabelText("審査コード"), "sesame-code");
    fireEvent.press(screen.getByText("コードでサインイン"));

    await waitFor(() => expect(mockSignInWithReviewCode).toHaveBeenCalledWith("sesame-code"));
  });

  it("空のコードでは送信しない", () => {
    render(<LoginScreen />);

    fireEvent(screen.getByTestId("review-login-trigger"), "longPress");
    fireEvent.press(screen.getByText("コードでサインイン"));

    expect(mockSignInWithReviewCode).not.toHaveBeenCalled();
  });

  it("認証失敗はインラインでエラーを表示する（審査員が誤入力と設定切れを判別できるように）", async () => {
    mockSignInWithReviewCode.mockRejectedValueOnce(new Error("401"));
    render(<LoginScreen />);

    fireEvent(screen.getByTestId("review-login-trigger"), "longPress");
    fireEvent.changeText(screen.getByLabelText("審査コード"), "wrong");
    fireEvent.press(screen.getByText("コードでサインイン"));

    await waitFor(() => expect(screen.getByText(/コードを確認できませんでした/)).toBeTruthy());
  });
});
