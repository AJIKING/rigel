# Plan: 利用計測（GA4 / Firebase Analytics）

> 状態: **フェーズ1（web=GA4）実装済み／フェーズ2（mobile）コード実装済み・ビルド検証待ち（2026-07-17）**。
> 方針合意: 「別々の2製品」ではなく **1つの GA4 プロパティに web / iOS / Android の3ストリーム**。
> Firebase Analytics の実体は GA4 なので、Firebase プロジェクトを GA4 プロパティにリンクして
> アプリとブラウザを同じイベント体系で横断分析する。

---

## 1. 構成（[決定]）

| 面 | SDK | 実装 |
|---|---|---|
| web | GA4（gtag。新規依存なし＝next/script） | `components/GoogleAnalytics.tsx` + `lib/analytics.ts`（`NEXT_PUBLIC_GA_MEASUREMENT_ID` 未設定なら完全無効） |
| mobile | `@react-native-firebase/app` + `analytics` | フェーズ2（ビルド検証が先。下記 5章） |
| 基盤 | Firebase プロジェクト ⇔ GA4 プロパティをリンク | イベント名は `@rigel/ui` の `ANALYTICS_EVENTS` を全面で共有（表記ゆれ防止） |

## 2. 計測の規律（[決定]・信頼ゲート）

- **PII を送らない**: メール・選手名・handle・牌譜内容・写真・トークン類は絶対にイベントへ載せない。
  パラメータは `ANALYTICS_EVENTS` 側で列挙した値（method / result 等の固定語彙）だけ。
- **広告用途に使わない**: 広告ID（IDFA）収集は無効化（→ iOS の ATT ダイアログ不要。
  Sign in with Apple 審査要件 4.8「同意なしに広告目的で行動収集しない」と整合）。
  Google シグナル・広告パーソナライズはプロパティ設定でオフ。
- **user_id は送らない（当面）**: 必要になったら内部 UUID のみを検討（メール等は不可）。
- **未設定なら無効**: 計測IDが無い環境（ローカル・preview）ではスクリプト自体を読み込まない。

## 3. イベント体系（`@rigel/ui` ANALYTICS_EVENTS が真実源）

| イベント | パラメータ | 意味 |
|---|---|---|
| `login` / `sign_up`（GA4標準） | `method`: "google" \| "apple" | ログイン成立 / 初回登録（SIWA 効果測定にも使う） |
| `analyze_kifu` | `result`: "success" \| "error" | 撮影→解析（コアファネル。実利用の解析成功率） |
| `analyze_problem` | `result`: 同上 | 何切るの写真AI再現 |
| `save_kifu` | — | 局の保存（エディタ） |
| `answer_problem` | — | 何切る回答 |

- ページビューは GA4 の拡張計測（history 変化）で自動取得（App Router のクライアント遷移も拾う）。
- 課金は RevenueCat → Firebase/GA4 連携で購読イベントを流す（真実源 RevenueCat の思想と整合。フェーズ2で設定）。
- フェーズ1で結線済みのイベント: `login` / `sign_up`（web）。残りは画面改修時に順次
  `trackEvent(ANALYTICS_EVENTS.xxx)` を差すだけ（体系は本表が真実源）。

## 4. フェーズ1: web（実装済み）

- `components/GoogleAnalytics.tsx` — gtag スクリプト（afterInteractive）。ID 未設定なら null。
- `lib/analytics.ts` — `trackEvent(name, params)`（gtag 未ロード/SSR では no-op。テストあり）。
- ログイン成立で `login` / 新規作成で `sign_up`（`/api/session` が created を返すよう拡張）。
- deploy.web.yml: Variables `NEXT_PUBLIC_GA_MEASUREMENT_ID`（G-XXXXXXX。未設定ならビルドに入らない）。

### 残作業（コード外）
1. GA4 プロパティ作成（Firebase プロジェクト作成 → GA4 リンク → web ストリーム追加が二度手間なし）。
2. GitHub Variables に `NEXT_PUBLIC_GA_MEASUREMENT_ID` を登録 → deploy.web を promote。
3. プロパティ設定: Google シグナル OFF・データ保持期間（14か月推奨）。
4. **外部送信規律（電気通信事業法）**: `rigel.plaria.co.jp/privacy` を実装済み（2026-07-17。
   /terms と同じ文書スタイル。7章に GA4/Firebase・Cloudflare・Stripe・RevenueCat・認証の
   外部送信を開示。sukikoe の /privacy を構成の参考にし、rigel の実態＝アカウント有り・
   画像非保存・退会有りに合わせて書き下ろし）。**文言の最終確認は事業者側で行うこと**。
   App Store Connect / Play Console のプライバシーポリシー URL にもこの URL を使う。

## 5. フェーズ2: mobile（コード実装済み・ビルド検証待ち）

実装済み（2026-07-17）:
- `@react-native-firebase/app`+`analytics`（v25）+ `expo-build-properties`（iOS `useFrameworks: "static"`）。
- `app.json`: 両 OS の `googleServicesFile` 参照 + config plugins。
- `firebase.json`: **広告ID収集の無効化**（adid/ssaid 収集 OFF・広告系 consent 既定 OFF
  → ATT ダイアログ不要・SIWA 審査要件 4.8 と整合）。
- `lib/analytics.ts`（trackEvent。ANALYTICS_EVENTS 共有・失敗は握りつぶし）＋
  ログイン成立の `login`/`sign_up` 結線（web と同一挙動・テストあり）。

残作業（この順で）:
1. **設定ファイルの配置（必須。無いと Codemagic の prebuild が失敗する）**:
   - `apps/mobile/GoogleService-Info.plist`（取得済みのもの）
   - Firebase コンソールで **Android アプリも追加**（package `jp.co.plaria.rigel`）→
     `apps/mobile/google-services.json`
   - どちらも秘密情報ではないのでコミットしてよい（API キーはサービス側で制限される公開値）。
2. **Codemagic で iOS/Android ビルド検証**（最大リスク＝iOS static frameworks と
   RevenueCat/openiap の Pod 干渉。New Architecture + RNFB v25 の組み合わせ確認）。
3. 実機で DebugView 確認（iOS: スキーム引数 `-FIRDebugEnabled` / Android:
   `adb shell setprop debug.firebase.analytics.app jp.co.plaria.rigel`）。
4. 解析・保存イベント（analyze_kifu / save_kifu 等）を Capture/編集画面へ順次結線。
5. ストア申告: App Privacy（App Store）/ データセーフティ（Play）に Analytics 分を追加。
6. RevenueCat → Firebase 連携を有効化（購読イベント）。

## 6. 見送り・代替（記録）

- Cloudflare Web Analytics: 同意バナー不要で最小だが、イベント/ファネル・アプリ横断が不可 → 不採用。
- PostHog / Amplitude: プロダクト分析としては強いが、無料の GA4 統一で開始し必要になったら再検討。
