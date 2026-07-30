# Plan: Sign in with Apple 対応（iOS 審査要件）

> 状態: **実装済み（2026-07-17。web/アプリ両対応）**。残りは Apple Developer 側の設定作業（下記 9章）。
> 決定の反映: CLAUDE.md 5章・設計ドキュメント 6章の認証は「Google + Sign in with Apple」に更新済み。

---

## 1. 背景 / なぜ必要か

- App Store Review Guideline **4.8 (Login Services)**: サードパーティ／ソーシャルログイン
  （Google 等）を**主アカウントの作成・認証に使う**アプリは、次を満たす**もう1つのログイン**を
  併設しなければならない:
  1. 収集データを氏名とメールに限定
  2. **メールアドレスを非公開にできる**（Hide My Email 相当）
  3. 同意なしに広告目的でアプリ内行動を収集しない
- 事実上の標準解が **Sign in with Apple（SIWA）**。rigel は Google 認証のみなので、
  **iOS を App Store に出すには SIWA（相当）の併設が必須**。
- 免除条件（自前ログインのみ / 企業・教育アカウント専用 / 特定サービス専用クライアント）には
  **該当しない**。
- 適用範囲は **App Store 配布の iOS アプリのみ**。web・Android には要件なし。
- あわせて 5.1.1(v)（アプリ内退会）は `DELETE /me` 実装済みで充足。ただし SIWA を提供する場合、
  **退会時に Apple のトークンを REST API（/auth/revoke）で失効させることが必須**（TN3194）。

## 2. 現行実装（前提）

- api: `POST /auth/google` — Google **ID トークンを jose + JWKS で検証**（iss/aud/RS256）→
  `users.google_sub` で find-or-create → 自前セッション JWT を発行。
  handle/表示名はランダム生成、email は運用目的のみ保存（レスポンスに出さない）。
- mobile: `expo-auth-session` の `useIdTokenAuthRequest` で id_token を取得 → `/auth/google`。
- DB: `users.google_sub TEXT NOT NULL UNIQUE`。

**SIWA も同じ OIDC 型**（iss `https://appleid.apple.com` / JWKS `https://appleid.apple.com/auth/keys`
/ aud = iOS の Bundle ID / RS256）なので、既存の Google と同じ流儀で足せる。
ネイティブの id_token 検証だけなら **client secret（.p8 鍵）不要**。
ただし**退会時の revoke には .p8 鍵で署名した client secret が必要**（下記 4-4）。

## 3. 方針（推奨案）

**「Google と対称な /auth/apple を足す」最小構成。iOS のみ SIWA ボタンを出す。**

- mobile（iOS のみ）: `expo-apple-authentication` のネイティブボタン（審査上、Apple 純正の
  ボタンデザイン必須）→ `identityToken`（+ 初回のみ `authorizationCode`/email）→ `POST /auth/apple`。
  Android では非表示（Play に同種要件は無い）。
- api:
  - `AppleTokenVerifier` ポート + jose 実装（Google 版の複製。aud = Bundle ID、
    web 用 Services ID を将来足すならカンマ区切り複数 aud）。
  - `AuthenticateWithApple` ユースケース（find-or-create。handle ランダム生成は共通化）。
  - `POST /auth/apple`（idToken + authorizationCode を受ける）。
- DB（**案Aを推奨**）:
  - 案A: `users.apple_sub TEXT UNIQUE`（nullable）を追加し、`google_sub` を **nullable 化**
    （「どちらか必須」はアプリ層で保証）。SQLite の NOT NULL 解除はテーブル再構築
    マイグレーションになる点に注意。**小さく進む**。
  - 案B: `user_identities(provider, sub, user_id)` テーブルへ分離。将来のアカウント連携に
    強いが移行が大きい。連携要件が出た時点で B へ移行する。
- email: Apple は**初回認可時しか返さない**＋ Hide My Email（private relay）がある。
  rigel は email を運用保存にしか使わないので影響軽微（取れたときだけ保存）。
- **退会時の revoke（必須）**: サインイン時に `authorizationCode` を Apple の `/auth/token` で
  交換し **refresh_token を users に保存**（authorizationCode は5分で失効するため退会時交換は不可）。
  `DELETE /me` に「apple_refresh_token があれば `/auth/revoke`」を追加。
  この交換・失効には **client secret（ES256, .p8 鍵で署名する JWT）**が必要:
  - 新しい env: `APPLE_TEAM_ID` / `APPLE_KEY_ID` / `APPLE_PRIVATE_KEY`(.p8) / `APPLE_BUNDLE_ID`
    （`.dev.vars` / Cloudflare secrets。コミットしない）。
- 設定作業（コード外）:
  - Apple Developer: App ID に Sign in with Apple capability、Keys で SIWA 用 .p8 を発行。
  - Expo: `app.json` に `ios.usesAppleSignIn: true`（entitlement。EAS/Codemagic ビルドに効く）。

## 4. アカウント統合の扱い（重要な仕様判断）

- 同一人物が web=Google / iOS=Apple でログインすると**別アカウントになる**。
  - email での自動統合は **不可**（private relay で一致しない・email は初回のみ）。
- 当面は「別アカウントになる」を仕様として明記（ログイン画面の文言で誘導:
  既存 Google ユーザーは iOS でも Google を選べばよい。SIWA は新規/Apple 派向け）。
- `[未確定]` 手動アカウント連携（設定画面で Google/Apple を後から紐付け）は需要が出たら検討
  （その時は DB 案B が効く）。

## 5. スコープ外（フェーズ2候補）

- **web の SIWA**: 4.8 の対象外なので初期リリースでは見送り。iOS で Apple 登録した人が
  web を使いたくなったら必要（Services ID + return URL 設定 + client secret での code 交換）。`[未確定]`
- Android への SIWA 表示（不要。出さない）。

## 6. タスク分解（TDD・縦切り）

1. **api**: `AppleTokenVerifier` ポート＋fake でユースケーステスト（Red→Green）
   → `AuthenticateWithApple`（find-or-create・ランダム handle 共通化）→ `POST /auth/apple`。
2. **DB**: `apple_sub` 追加＋`google_sub` nullable 化のマイグレーション（生成 SQL を確認して適用）。
3. **api**: サインイン時の code→refresh_token 交換の保存、`DELETE /me` に revoke を追加
   （Apple API はポート化して fake でテスト。実疎通は鍵設定後）。
4. **mobile**: `expo-apple-authentication` 導入（新規依存 = 承認事項）、LoginScreen に
   iOS 限定で Apple ボタン、`signInWithApple` を auth コンテキストへ。
5. **設定**: Apple Developer（capability・.p8）、`app.json`、Cloudflare secrets、Codemagic。
6. **ドキュメント**: 設計ドキュメント 6章「認証 = Google認証のみ」→「Google + Apple(iOS)」へ
   更新。CLAUDE.md 5章の表も同時更新。

概算工数: api+DB 1〜1.5日 / mobile 0.5〜1日 / 設定・実機検証 0.5日（Apple 側の反映待ち含む）。

## 7. 未確定（着手前に確認）

- `[未確定]` DB 案A/案B の最終判断（推奨=A）。
- `[未確定]` nonce の扱い（ネイティブ flow でも hashed nonce を付けるのが推奨。付ける想定）。
- `[未確定]` refresh_token の保存形態（平文 or 暗号化。D1 内・用途は revoke のみ）。
- `[未確定]` 着手時期（iOS ストア提出の直前で良い。審査要件なので TestFlight 配布段階では未対応でも
  進められるが、審査提出までに必須）。

## 9. 実装済みの内容と残作業（2026-07-17）

実装済み（コード）:
- api: `POST /auth/apple`（`AuthenticateWithApple` / `JoseAppleTokenVerifier`。APPLE_CLIENT_ID 未設定は 501）、
  `users.apple_sub`/`apple_refresh_token` 追加・`google_sub` nullable 化（migration 0013）、
  サインイン時の code→refresh_token 交換と退会時 revoke（`HttpAppleAuthGateway`。ベストエフォート）。
- web: `AppleSignInButton`（Apple JS ポップアップ）→ BFF `/api/session`（provider=apple）。
  `NEXT_PUBLIC_APPLE_CLIENT_ID`（Services ID）未設定ならボタン非表示。
- mobile: `expo-apple-authentication` の純正ボタン（iOS のみ表示）→ `/auth/apple`。
  `app.json` に `ios.usesAppleSignIn` + plugin 追加。
- **web も Apple を出す判断に変更**（当初はフェーズ2）: iOS で Apple 登録したユーザーが
  web でも同じアカウントに入れるようにするため。

残作業（コード外の設定。ストア提出前に必須）:
1. Apple Developer: App ID `jp.co.plaria.rigel` に Sign in with Apple capability を付与。
2. Services ID `jp.co.plaria.rigel.web` を作成し、ドメイン `raisha.jp` と
   Return URL `https://raisha.jp/login` を登録（web ポップアップの redirectURI）。
3. Keys で Sign in with Apple 用の .p8 を発行（Key ID を控える）。
4. **GitHub（environment "production"）の Secrets**: `APPLE_TEAM_ID` / `APPLE_KEY_ID` /
   `APPLE_PRIVATE_KEY`（.p8 の中身を改行込みで登録）。deploy.api.yml が Worker Secrets へ
   自動投入する（未登録の間はスキップ＝revoke だけ無効。登録後に api を再デプロイ）。
   `APPLE_CLIENT_ID` は wrangler.toml の vars（公開値）に設定済み。
5. **GitHub の Variables**: `NEXT_PUBLIC_APPLE_CLIENT_ID=jp.co.plaria.rigel.web`
   （deploy.web.yml がビルド時に焼き込む。未設定なら Apple ボタン非表示）。
   ローカル確認用に apps/web/.env.local へも同値を追記。
6. iOS ビルド（EAS/Codemagic）で entitlement が付くこと・実機でのサインイン疎通を確認。

## 参考

- App Review Guidelines 4.8 / 5.1.1(v): https://developer.apple.com/app-store/review/guidelines/
- 退会時の revoke（TN3194）: https://developer.apple.com/documentation/technotes/tn3194-handling-account-deletions-and-revoking-tokens-for-sign-in-with-apple
- 退会要件のアナウンス: https://developer.apple.com/news/?id=12m75xbj
- expo-apple-authentication: https://docs.expo.dev/versions/latest/sdk/apple-authentication/
