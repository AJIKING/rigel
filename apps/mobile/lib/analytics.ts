// 計測イベント送信（Firebase Analytics = GA4 のアプリストリーム）。
// イベント名・パラメータは @rigel/ui の共有定義のみ（PII を型で締め出す）。
// 広告ID は firebase.json で収集無効（ATT ダイアログ不要・SIWA 審査要件 4.8 と整合）。
// ネイティブモジュールのため Expo Go では動かない（dev build / Codemagic 必須）。
// 送信失敗でアプリの動作を壊さない（ベストエフォート）。
// 設計: docs/plans/analytics.md

import { getAnalytics, logEvent } from "@react-native-firebase/analytics";
import type { AnalyticsEvent, AnalyticsParams } from "@rigel/ui";

// logEvent の型は「予約イベント名ごとのオーバーロード＋カスタム名（予約名を除外）」で、
// login/sign_up を含むユニオン（AnalyticsEvent）を受けられない。実装シグネチャ
// （name: string）相当へ広げて呼ぶ（値の内容は ANALYTICS_EVENTS で保証済み）。
const logEventByName = logEvent as (
  analytics: ReturnType<typeof getAnalytics>,
  name: string,
  params?: Record<string, unknown>,
) => Promise<void>;

export async function trackEvent(name: AnalyticsEvent, params?: AnalyticsParams): Promise<void> {
  try {
    await logEventByName(getAnalytics(), name, params);
  } catch (e) {
    console.warn("analytics logEvent に失敗", e);
  }
}
