// trackEvent（Firebase Analytics ラッパ）のテスト。ネイティブ実体はモックする。

const mockLogEvent = jest.fn();
jest.mock("@react-native-firebase/analytics", () => ({
  getAnalytics: () => ({}),
  logEvent: (...a: unknown[]) => mockLogEvent(...a),
}));

import { ANALYTICS_EVENTS } from "@rigel/ui";
import { trackEvent } from "./analytics";

describe("trackEvent（Firebase Analytics 送信の共通入口）", () => {
  beforeEach(() => mockLogEvent.mockReset());

  it("共有イベント名とパラメータを logEvent へ渡す", async () => {
    await trackEvent(ANALYTICS_EVENTS.login, { method: "apple" });
    expect(mockLogEvent).toHaveBeenCalledWith(expect.anything(), "login", { method: "apple" });
  });

  it("送信失敗でも例外を投げない（アプリの動作を壊さない）", async () => {
    mockLogEvent.mockImplementationOnce(() => {
      throw new Error("native unavailable");
    });
    await expect(
      trackEvent(ANALYTICS_EVENTS.signUp, { method: "google" }),
    ).resolves.toBeUndefined();
  });
});
