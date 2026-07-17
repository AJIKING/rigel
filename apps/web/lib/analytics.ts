// 計測イベント送信（GA4 / gtag）。イベント名・パラメータは @rigel/ui の共有定義のみ
// （PII を型で締め出す＝メール・選手名・牌譜内容は載せられない）。
// GA 未設定（NEXT_PUBLIC_GA_MEASUREMENT_ID なし）や未ロードの環境では何もしない。
// 設計: docs/plans/analytics.md

import type { AnalyticsEvent, AnalyticsParams } from "@rigel/ui";

export function trackEvent(name: AnalyticsEvent, params?: AnalyticsParams): void {
  if (typeof window === "undefined") return;
  const w = window as { gtag?: (...args: unknown[]) => void };
  w.gtag?.("event", name, params);
}
