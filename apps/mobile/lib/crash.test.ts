// Crashlytics ラッパの単体テスト（docs/plans/crashlytics.md Task 3）。
// 「計測がアプリを壊さない」= no-throw と dev 無効を境界として固定する。

const mockCrash = {
  getCrashlytics: jest.fn(() => ({ native: true })),
  recordError: jest.fn(),
  setAttributes: jest.fn(async (..._a: unknown[]) => null),
};
jest.mock("@react-native-firebase/crashlytics", () => ({
  getCrashlytics: () => mockCrash.getCrashlytics(),
  recordError: (...a: unknown[]) => mockCrash.recordError(...a),
  setAttributes: (...a: unknown[]) => mockCrash.setAttributes(...(a as [unknown, unknown])),
}));

import { trackError } from "./crash";

const g = globalThis as { __DEV__?: boolean };

describe("trackError（Crashlytics ラッパ）", () => {
  let devBefore: boolean | undefined;
  beforeEach(() => {
    jest.clearAllMocks();
    devBefore = g.__DEV__;
    g.__DEV__ = false; // 既定は本番相当（送信する側）で検証
  });
  afterEach(() => {
    g.__DEV__ = devBefore;
  });

  it("recordError を呼び、文脈（screen/op）をカスタムキーとエラー名に載せる", () => {
    const err = new Error("boom");
    trackError(err, { screen: "capture", op: "analyze" });

    expect(mockCrash.setAttributes).toHaveBeenCalledWith(
      { native: true },
      { screen: "capture", op: "analyze" },
    );
    expect(mockCrash.recordError).toHaveBeenCalledWith({ native: true }, err, "capture:analyze");
  });

  it("Error でない値（文字列 throw 等）は Error に包んで記録する", () => {
    trackError("string failure", { screen: "login", op: "google_sign_in" });

    const [, recorded] = mockCrash.recordError.mock.calls[0] as [unknown, Error];
    expect(recorded).toBeInstanceOf(Error);
    expect(recorded.message).toBe("string failure");
  });

  it("__DEV__ では何も送らない（開発中のエラーでダッシュボードを汚さない）", () => {
    g.__DEV__ = true;
    trackError(new Error("dev"), { screen: "capture", op: "analyze" });
    expect(mockCrash.recordError).not.toHaveBeenCalled();
    expect(mockCrash.setAttributes).not.toHaveBeenCalled();
  });

  it("crashlytics 自体が例外を投げても trackError は握りつぶす（アプリを壊さない）", () => {
    mockCrash.getCrashlytics.mockImplementationOnce(() => {
      throw new Error("no firebase app");
    });
    expect(() => trackError(new Error("x"), { screen: "capture", op: "analyze" })).not.toThrow();
  });

  it("setAttributes の失敗（Promise reject）でも unhandled rejection にしない", async () => {
    mockCrash.setAttributes.mockRejectedValueOnce(new Error("native down"));
    trackError(new Error("x"), { screen: "settings", op: "purchase" });
    await Promise.resolve(); // reject を流す（unhandled なら jest が落とす）
    expect(mockCrash.recordError).toHaveBeenCalled();
  });
});
