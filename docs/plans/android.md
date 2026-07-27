# Plan: Android 対応（Google Play 内部テストで動くものを最短で）

> 状態: 2026-07-07 作成。コード側タスク（1〜3）は完了。
> **2026-07-27 リリース前点検で棚卸し**（下記 §12）。残りは外部コンソール作業と、
> 新たに見つかった2件（targetSdkVersion の期限・Apple 登録者の Android での到達性）。

## 1. 目的（なぜ）

mobile（Expo/RN）は iOS 先行（TestFlight 配布まで整備済み）で、Android は「足場のみ」
（app.json の package・adaptive icon・codemagic の `android-googleplay` ワークフロー）。
中核ループ（撮影→解析→保存→閲覧→修正）を Android 実機でも使えるようにし、
Play 内部テスト配布までつなげる。課金（Play Billing）は本 Plan の対象外（別 Plan）。

## 2. ハーネス構成要素

- **権限・HITL**: Google Cloud / Play Console / Codemagic の外部設定は人間の作業として明示的に切り出す。
- **文脈供給・記憶**: セットアップ手順と検証結果を本ファイルと CLAUDE.md に焼き付ける（次セッションが迷わない）。
- **検証**: 通常ゲート＋「Android 実機チェックリスト」（実機でしか確定しない挙動を列挙して潰す）。
- スキーマ（背骨）・AI まわりは触らない。

## 3. スコープ

- やること:
  - Android での Google ログイン成立（expo-auth-session の Android 用 client 設定＋リダイレクト受け）
  - Play 内部テスト配布（codemagic `android-googleplay` の前提を満たす）
  - Android 実機での中核ループ検証（チェックリスト）
  - 手順・結論のドキュメント化
- やらないこと（非対象）:
  - **Play Billing 対応**（現状は暫定 Stripe Checkout。内部テストでは許容し、公開前の別 Plan にする）
  - ストア公開（クローズド/オープンテスト昇格・審査対応・ストア掲載情報）
  - Android 固有の UI 調整（実機検証で問題が出た場合に別タスク化）
  - 設計ドキュメント2章の非スコープはそのまま（点数自動計算しない・画像を保存しない・実物卓のみ 等）

## 4. `[決定]` / `[未確定]` の仕分け

- 依拠する `[決定]`:
  - 認証は Google のみ。api は `GOOGLE_CLIENT_ID` カンマ区切りで複数 aud を許可（実装・テスト済み）
  - Bundle ID / Package は `jp.co.plaria.rigel` で統一（e940106）
- 本 Plan で新たに触れる `[未確定]`（要実機検証）:
  - **A. Android の OAuth リダイレクト構成**: expo-auth-session v6 の実装は
    `clientId = androidClientId ?? clientId`、`redirectUri = "<applicationId>:/oauthredirect"`
    （`build/providers/Google.js` L116-149 で確認済み）。よって
    `scheme: "jp.co.plaria.rigel"` の intent filter で受ける想定だが、**実機で通るまで確定としない**。
  - **B. Play App Signing の SHA-1**: 内部テスト配布物は Google の署名鍵で再署名されるため、
    アップロード鍵と Play 署名鍵の**両方の SHA-1** を Android OAuth クライアントに登録する必要がある想定。要確認。
  - 既存の `[未確定]`（toAbsoluteSeat 回転方向など）には触れない。

## 5. 影響範囲

- 触る: `apps/mobile`（app.json / screens/LoginScreen.tsx / lib 新規1ファイル＋テスト）、docs（本ファイル）、CLAUDE.md（完了時）
- api: **コード変更なし**（本番の `GOOGLE_CLIENT_ID` シークレットに Android クライアントIDを追記するのみ＝運用作業）
- 依存追加: なし
- スキーマ（背骨）への影響: なし

## 6. 信頼まわり

- 認証（プライバシー）に接するが、**id_token の検証経路は既存のまま**（jose で署名・iss・aud 検証。aud に Android クライアントIDを足すだけ）。
- email 非返却・プロフィールのランダム生成などの既存ルールは変更しない。
- 課金カウント・画像非保存: 本 Plan では該当なし（課金コードに触れない）。

## 7. 受け入れ条件

- [ ] `googleClientConfig`: `EXPO_PUBLIC_GOOGLE_CLIENT_ID` 未設定なら null（ログイン無効の現行挙動を維持）
- [ ] `googleClientConfig`: `EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID` があれば `androidClientId` として返し、無ければ従来どおり `clientId` のみ
- [ ] LoginScreen が上記設定を `useIdTokenAuthRequest` に渡す（既存の無効時 UI は不変）
- [ ] app.json に `scheme: "jp.co.plaria.rigel"`（prebuild で Android の intent filter が生える）
- [ ] mobile ゲート（tsc / ESLint / Jest）緑
- [ ] （実機・HITL）内部テストビルドで Google ログイン→牌譜一覧→閲覧が通る → 結果で `[未確定]` A/B を確定し本ファイル更新

## 8. Task 分解

1. [コード/TDD] `lib/google-login.ts` の `googleClientConfig`（env → 設定の純関数）
   → Red: 「ANDROID_CLIENT_ID があれば androidClientId を含む」ほか
2. [コード] LoginScreen を `googleClientConfig` 経由に差し替え（挙動は clientId のみなら不変）
3. [設定] app.json に `scheme` 追加
4. [HITL/人間] 外部セットアップ（下記チェックリスト）
5. [HITL/検証] codemagic `android-googleplay` 実行 → 実機検証 → `[未確定]` を確定して本ファイル・CLAUDE.md 更新

### HITL チェックリスト（人間の作業。コードからは実施不可）

- [ ] アップロード用キーストア作成（未作成なら）→ SHA-1 を控える
- [ ] Google Cloud Console: **Android 用 OAuth クライアント**作成（package `jp.co.plaria.rigel` + アップロード鍵 SHA-1）
- [ ] Play Console: アプリ登録（`jp.co.plaria.rigel`）→ 内部テストトラック作成 → **Play App Signing の SHA-1** も OAuth クライアントに追加登録
- [ ] api 本番の `GOOGLE_CLIENT_ID` に Android クライアントIDをカンマ追記（wrangler secret）
- [ ] Codemagic: `keystore_credentials`（CM_KEYSTORE ほか）/ `google_play_credentials`（サービスアカウント JSON）/
      `rigel_mobile_env` に `EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID` を追加
- [ ] `android-googleplay` を手動起動 → 内部テストから実機インストール

### 実機チェックリスト（内部テストビルドで）

- [ ] Google ログイン（ブラウザ→アプリ復帰→セッション確立）
- [ ] 牌譜一覧・閲覧・盤面再生 / 何切る回答
- [ ] 撮影→解析（Gemini 鍵設定済み環境なら）→ 半荘保存
- [ ] 設定画面（プラン表示。購入は暫定 Stripe のまま＝内部テストでは触らない）

## 9. 検証 / eval 方針

- ゲート: mobile の typecheck / lint / test（format はルート）。AI 精度 eval: 該当なし。
- 実機検証は上記チェックリスト。Expo/EAS・Codemagic は CI 外（CLAUDE.md 準拠）。

## 10. リスク / 未決事項

- expo-auth-session はプロキシ廃止後の素の構成。Android 実機で `oauthredirect` が受からない場合は
  `redirectUri` の明示指定（`makeRedirectUri`）や scheme の見直しが必要（→ `[未確定]` A の検証で確定）。
- Codemagic の Android ワークフローは一度も実行実績がない（hoisted linker での gradle 初回ビルドは未検証）。
- 暫定 Stripe Checkout は**公開時に Play ポリシー違反リスク**。内部テスト段階で Play Billing の別 Plan を立てる。

## 11. 完了の定義

- [ ] 受け入れ条件がすべて緑（実機分は検証結果を追記）
- [ ] ゲート通過
- [ ] `[未確定]` A/B を確定し、本ファイルと CLAUDE.md に反映

---

## 12. リリース前点検（2026-07-27）

iOS 水準に達していない点の棚卸し。**優先順に並べる**。

### 解消済み（本 Plan 起案時のリスクのうち）

- **暫定 Stripe Checkout の Play ポリシー違反リスク** → 解消。課金は RevenueCat（`react-native-purchases`）の
  アプリ内購入に移行し、mobile からの web 決済誘導も落とした（アンチステアリング対応。
  `SettingsScreen.tsx:79`）。購読管理は RevenueCat の `managementURL` を開く**ストア非依存**の実装で、
  `isStoreManagedSubscription` も `PLAY_STORE` を織り込み済み＝**Play 対応にコード変更はほぼ不要**。
- コード側 Task 1〜3（`googleClientConfig` / LoginScreen / `scheme`）は実装・テスト済み。

### A. targetSdkVersion が Play の下限を割っている（**リリースを止める**）

Expo SDK 52 の `targetSdkVersion` は 34。Play の下限は現在 **35**、**2026-08-31 以降は 36**。
このままではアップロードが弾かれる。
→ **[expo-sdk-57.md](expo-sdk-57.md) で対応**（暫定で 35 に上げる案は、エッジトゥエッジ対応を
2回やることになるので採らない）。本 Plan では扱わない。

### B. Apple で登録した人が Android で自分のアカウントに入れない（**設計上の穴**）

- `AuthenticateWithApple` は `appleSub` だけで引き当てる（`authenticate-with-apple.usecase.ts`）。
  `AuthenticateWithGoogle` は `googleSub` だけ。**email での突き合わせも連携機能も無い。**
- Android の `LoginScreen` は Apple ボタンを出さない（`Platform.OS === "ios"` 分岐）。
  コメントの理由は「Play に同種の要件は無い」で、**アカウント到達性は考慮されていない**。
- web には Apple ログインがある（`AppleSignInButton`。App Store 審査要件 4.8 の併設）。

結果、**iOS で Apple 登録した人が Android 版で Google ログインすると別アカウントが新規作成される**。
牌譜・何切る・お気に入り、そして **App Store で買った有料プランに到達できない**。

対応案（**未決。オーナー判断待ち**）:

1. **Android にも Apple ログインを出す** — Apple の web フローで可能。純正ボタン必須は iOS の
   HIG 要件なので Android は自前ボタンでよい。api 側は `identity.aud` で web の Services ID を
   すでに受けられる（`authenticate-with-apple.usecase.ts` のコメント）。**筋としてはこれ。**
2. ログイン画面に「iOS で Apple で登録した方へ」の導線・案内を置く（暫定）
3. 認証プロバイダの連携機能（既存アカウントに後から Google/Apple を紐づける）を作る（本格対応）

### C. Play Billing（RevenueCat Android）が未設定

`revenueCatApiKey()` は Android で `EXPO_PUBLIC_REVENUECAT_ANDROID_KEY` を読むが、
codemagic.yaml のコメントが「Play 対応時に追加」のまま。未設定でも購入導線が無効になるだけで
クラッシュはしないが、有料プランが売れない。**コンソール作業が主。**

- [ ] RevenueCat の Android Public SDK キー（`goog_...`）を `rigel_mobile_env` に追加
- [ ] Play Console で定期購入商品を作成。**価格は `PLAN_MONTHLY_PRICE_STORE`（¥700 / ¥1,800）と
      必ず一致させる**（@rigel/ui のコメント参照。表示専用＝実際の請求はストア設定が正）
- [ ] RevenueCat と Play の連携（サービスアカウント / Play Billing の権限付与）

### D. OAuth の SHA-1 は2つ登録が要る（`[未確定] B`。**未確定のまま**）

Play App Signing はアップロード鍵とは別に Google が再署名するため、**アップロード鍵の SHA-1 と
Play アプリ署名鍵の SHA-1 の両方**を Android OAuth クライアントに登録しないと、
内部テスト配布物で Google ログインだけが失敗する。ローカルビルドでは再現しないので
原因に辿り着きにくい。あわせて api 本番の `GOOGLE_CLIENT_ID` に Android クライアント ID を
カンマ追記する（コードは複数 aud 対応済み）。

### E. Codemagic の `android-googleplay` は一度も実行実績がない → **初回実行済み（2026-07-27）**

結果: **足場は健全**。prebuild → キーストア配置 → versionCode 差し替え → Gradle 267 タスク
（autolinking 含む）まで通り、`node-linker=hoisted` の懸念は解消。
唯一の失敗は `expo-modules-core:compileReleaseKotlin` — SDK 52 既知の版ズレ
（Compose Compiler 1.5.15 は Kotlin 1.9.25 とペアだが、prebuild テンプレートの既定が 1.9.24）。
→ app.json の expo-build-properties に `android.kotlinVersion: "1.9.25"` を追加して対処
（gradle.properties へ入ることを prebuild で検証済み）。**再実行待ち**。
なお iOS 側はこの版ズレの影響を受けない（Kotlin は Android ビルドのみ）。

### iOS と差が無いことを確認した項目

パッケージ名 `jp.co.plaria.rigel` は iOS のバンドル ID・`google-services.json`・codemagic の
変数すべてで一致。アダプティブアイコン、Firebase 設定ファイル、キーストア／サービスアカウントの
受け口、versionCode の連番付与、型チェック工程は iOS と同水準。退会は両 OS 共通の API で、
公開の `/privacy` に削除方針の記載があり Play のデータ削除 URL 要件に使える。

### 進める順番

1. **E**（現状のまま Codemagic を1回流す。足場の確認だけ）
2. **A**（[expo-sdk-57.md](expo-sdk-57.md)。期限が近いので最優先の実作業）
3. **B**（方針決定 → 実装）
4. **C**（コンソール作業）
5. **D**（SHA-1 二重登録 → 実機で Google ログイン確認 → `[未確定] A/B` を確定）
