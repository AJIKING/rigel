import { googleClientConfig } from "./google-login";

describe("googleClientConfig", () => {
  it("clientId 未設定なら null（ログイン無効の現行挙動を維持）", () => {
    expect(googleClientConfig({})).toBeNull();
    // Android 用だけあってもベースが無ければ無効のまま（iOS/dev で壊れるボタンを出さない）
    expect(googleClientConfig({ androidClientId: "android-id" })).toBeNull();
  });

  it("clientId のみなら clientId だけを返す（従来挙動と同じ）", () => {
    expect(googleClientConfig({ clientId: "base-id" })).toEqual({ clientId: "base-id" });
  });

  it("androidClientId があれば androidClientId を含めて返す", () => {
    expect(googleClientConfig({ clientId: "base-id", androidClientId: "android-id" })).toEqual({
      clientId: "base-id",
      androidClientId: "android-id",
    });
  });

  it("空文字は未設定として扱う", () => {
    expect(googleClientConfig({ clientId: "" })).toBeNull();
    expect(googleClientConfig({ clientId: "base-id", androidClientId: "" })).toEqual({
      clientId: "base-id",
    });
  });
});
