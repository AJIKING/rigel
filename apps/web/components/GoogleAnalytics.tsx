"use client";

import Script from "next/script";

// GA4 の測定ID（G-XXXXXXXXXX。公開値）。未設定ならスクリプト自体を読み込まない
// （ローカル・preview では計測しない）。設計: docs/plans/analytics.md
const GA_ID = process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID?.trim();

/**
 * GA4（gtag）の読み込み。ページビューは GA4 の拡張計測（history 変化）が
 * App Router のクライアント遷移も拾う。イベント送信は lib/analytics.ts の trackEvent。
 */
export function GoogleAnalytics() {
  if (!GA_ID) return null;
  return (
    <>
      <Script
        src={`https://www.googletagmanager.com/gtag/js?id=${GA_ID}`}
        strategy="afterInteractive"
      />
      <Script id="ga-init" strategy="afterInteractive">
        {`window.dataLayer = window.dataLayer || [];
function gtag(){dataLayer.push(arguments);}
gtag('js', new Date());
gtag('config', '${GA_ID}');`}
      </Script>
    </>
  );
}
