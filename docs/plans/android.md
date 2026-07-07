# Plan: Android 対応（Google Play 内部テストで動くものを最短で）

> 状態: 2026-07-07 作成。ユーザー指示「実行計画を整理してから対応進めてください」により、
> コード側タスクは本 Plan 提示後に着手する（外部コンソール作業は人間のチェックリストとして残す）。

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
