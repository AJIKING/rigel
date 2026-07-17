import { afterEach, describe, expect, it, vi } from "vitest";
import { ANALYTICS_EVENTS } from "@rigel/ui";
import { trackEvent } from "./analytics";

describe("trackEvent（GA4 送信の共通入口）", () => {
  afterEach(() => {
    delete (window as { gtag?: unknown }).gtag;
  });

  it("gtag がロード済みならイベントを送る", () => {
    const gtag = vi.fn();
    (window as { gtag?: unknown }).gtag = gtag;
    trackEvent(ANALYTICS_EVENTS.login, { method: "apple" });
    expect(gtag).toHaveBeenCalledWith("event", "login", { method: "apple" });
  });

  it("gtag が無い環境（GA 未設定・未ロード）では何もしない（例外にしない）", () => {
    expect(() => trackEvent(ANALYTICS_EVENTS.signUp, { method: "google" })).not.toThrow();
  });
});
