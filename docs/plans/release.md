# Plan: リリース準備（ストア提出 + 本番公開）

> 起案: 2026-08-05（オーナー指示「リリース準備始めよう」）。3方向の全面棚卸し
> （デプロイ/インフラ・ストア提出・残タスク/未確定）の結果を1枚に統合した**マスターチェックリスト**。
> 個別の手順・理由は各 plan / DEPLOY.md が真実源で、本書はそこへの索引と順序付けを担う。
> 現在地: web は raisha.jp で本番稼働中（手動 promote 制）。mobile は iOS=TestFlight 配布まで、
> Android=AAB アップロードまで実績あり（SDK 57 移行後の再ビルドが未）。

## 0. リリースの定義

1. **web**: 最新 main の promote（api → web の順）＋運用設定の完了
2. **iOS**: App Store 公開（TestFlight → 審査提出）
3. **Android**: Play 公開（内部テスト → 製品版）— iOS より前提作業が多く、**iOS 先行で可**

## 1. ブロッカー一覧（カテゴリ別）

### A. コード側（リポジトリ内で完結）

- [x] A-1. **購入の復元（Restore Purchases）** — 未実装だった（審査の定番リジェクト）。
      `restorePurchases` ラッパ＋設定画面の「購入を復元」行を実装（2026-08-05）
- [x] A-2. **購入画面の 3.1.2 要件** — PlanSheet に自動更新の明記＋利用規約/プライバシーポリシー
      リンク、設定画面に「サポート」節（規約・ポリシー）を追加（2026-08-05）
- [x] A-3. **写真ライブラリの権限文言** — `expo-image-picker` が plugins 未登録で
      NSPhotoLibraryUsageDescription が入らない恐れ → plugin 追加＋日本語文言（2026-08-05。
      カメラ/マイクは不使用なので false）。次回 prebuild（Codemagic）で Info.plist を要確認
- [x] A-4. 権限アラートの旧名「rigel」→「RAISHA」修正（2026-08-05）
- [x] A-5. **store-listing.md の審査用アカウント節を案B（合言葉ログイン）に更新**（2026-08-05。
      旧案=専用 Google アカウント＋Granted Entitlements の記述が残っていた）
- [x] A-6. **splash** — 最小構成で実装（2026-08-05 オーナー承認）: `expo-splash-screen`
      （~57.0.5・SDK 同梱モジュール）を追加し、ダーク背景 `#0f1115`（アプリ UI と同色）＋
      adaptive-icon 中央 180px。見た目の最終確認は C-1 のビルドで
- [ ] A-7. ストアスクショの再生成（`pnpm shots`。2026-07-30 生成のまま → 特訓開放・
      ランキング・マイページ統計変更が反映されていない）。**提出直前に一度回すのが安全**

### B. オーナーのコンソール/運用作業（コード外）

**Cloudflare**
- [ ] B-1. **WAF レートリミットルール作成**（最優先: `api.raisha.jp` の `/auth/*` を IP 10回/分 Block。
      次点 `/analyze` `/problems/analyze`）。Workers 側バインディングは best-effort と実測済みで、
      エッジで止めるにはこれが唯一の防波堤（apps/api/DEPLOY.md 参照）
- [ ] B-2. **AI Gateway のキャッシュ/ログ設定確認**（撮影画像がゲートウェイ側に残らないこと。
      「画像は所有者のみ」の主張が Workers 内だけで完結しない。security-hardening P7）
- [ ] B-3. GA4 プロパティ作成 → GitHub Variables `NEXT_PUBLIC_GA_MEASUREMENT_ID` → web promote
      （Google シグナル OFF・保持14か月。docs/plans/analytics.md）

**Apple Developer / App Store Connect**（docs/plans/sign-in-with-apple.md・android.md §12-B）
- [ ] B-4. App ID に SIWA capability / Services ID `jp.co.plaria.rigel.web`（ドメイン検証＋
      Return URL: web と `https://api.raisha.jp/auth/apple/callback` の両方）/ .p8 発行
- [ ] B-5. GitHub Secrets `APPLE_TEAM_ID`/`APPLE_KEY_ID`/`APPLE_PRIVATE_KEY`（退会時 revoke 用）＋
      Variables `NEXT_PUBLIC_APPLE_CLIENT_ID`
- [ ] B-6. App Store Connect: アプリ登録・定期購読商品（`rigel.next.monthly` ¥700 /
      `rigel.pro.monthly` ¥1,800）・App Privacy 申告（docs/plans/analytics.md の申告内容＋
      /privacy の記載が元ネタ）

**Firebase / Codemagic**（docs/plans/analytics.md・codemagic.yaml 冒頭コメント）
- [ ] B-7. `GoogleService-Info.plist` / `google-services.json` の配置（**無いと prebuild が失敗**）
- [ ] B-8. Codemagic の環境変数グループ確認（`rigel_mobile_env` に `EXPO_PUBLIC_APPLE_CLIENT_ID` と
      `REVENUECAT_ANDROID_KEY` を追加）

**Google Play / RevenueCat（Android。iOS 先行なら後回し可）**（docs/plans/android.md §12-C/D）
- [ ] B-9. Play Console: 内部テスト・定期購読商品（価格一致必須）・データセーフティ申告
- [ ] B-10. OAuth の SHA-1 **二重登録**（アップロード鍵＋Play アプリ署名鍵。`[未確定] B`）
- [ ] B-11. RevenueCat: Android SDK キー発行・Play 連携（サービスアカウント）

**審査運用（提出直前）**（docs/plans/review-login.md・store-listing.md）
- [ ] B-12. `REVIEW_LOGIN_SECRET` 投入 → 実機で審査ユーザー作成 → D1 で pro 化 →
      サンプルデータ投入 → 審査メモ記載（審査完了後に secret 削除）
- [ ] B-13. 審査期間中の `REVENUECAT_ALLOW_SANDBOX=true` の要否判断（sandbox 購入が plan に
      反映されず「買ったのに解放されない」に見えるリスクと、手動 pro が上書きされる副作用の天秤）

### C. 実機検証（Codemagic 再ビルドが前提）

- [ ] C-1. **Codemagic 再ビルド（iOS/Android）**（SDK 57 移行後初。expo-sdk-57.md Task 8。
      今回の A-1〜A-4 も乗る。iOS static frameworks × Firebase/RevenueCat の Pod 干渉が最大リスク）
- [ ] C-2. **`toAbsoluteSeat` の回転方向**（東家手前の実写で目視。誤ると全席90°ズレ。
      設計 9章 #1・security-hardening P7。**確定したら設計ドキュメントを [決定] に更新**）
- [ ] C-3. 中核ループの実機スモーク（撮影→解析→保存→閲覧→修正。async-analysis Task 10 の
      アプリ開閉完走・photo-retention Task 13 の写真 E2E を含む）
- [ ] C-4. エッジトゥエッジの目視（expo-sdk-57.md Task 5）・特訓 Segment の狭幅表示・
      web ヘッダ 360px（quiz-open-and-ranking.md 残）
- [ ] C-5. Apple ログイン（iOS 純正 / Android web フロー）・Google ログイン（Android は
      SHA-1 登録後）・購入復元の実機疎通
- [ ] C-6. prebuild 後の Info.plist に `NSPhotoLibraryUsageDescription` が入っていること（A-3 の検証）

### D. オーナー判断が要る未決事項

- [x] D-1. **有料プラン契約中のアカウント削除不可（403）** — **[決定] 2026-08-05: 現状のまま
      （削除不可）で提出してみる**（オーナー判断）。App Store 5.1.1(v) でリジェクトされた場合の
      フォールバックは「削除を許可し、購読はストアの購読設定から解約が必要と明示する」形への変更
      （サーバ 403 の撤廃＋mobile の disabled 解除＋文言。1日以内で対応可能）
- [x] D-2. **iPad 対応** — **[決定] 2026-08-05: 初回は iPhone のみ**。`supportsTablet: false`
      反映済み（iPad スクショ不要になった）
- [x] D-3. splash — 承認・実装済み（A-6）
- [x] D-4. Crashlytics — **承認・コード側（crashlytics.md Task 2〜6）実装済み（2026-08-05）**:
      依存＋plugin、trackError（固定語彙・no-throw・dev 無効）、主要 catch の計装
      （Capture/ProblemEdit/Login/GameDetail/billing）、Codemagic dSYM ステップ。
      残 = C-1 のビルド共存検証と実機の可読性確認（前提: B-7 の GoogleService ファイル配置）
- [ ] D-5. AI 精度の実写再計測（設計 9章 #3。スマホ実写・映像スクショの eval case 追加）を
      リリース前にやるか（コア価値の品質保証。misreadRate 16% が実写でどうなるかは未知）

## 2. 推奨順序（クリティカルパス）

```
Phase R1（web 公開の完成）    : B-1 WAF → B-2 AI Gateway 確認 → B-3 GA4
                              → api promote（migration 0019/0020 適用）→ web promote
Phase R2（ビルド前の決定）    : D-1 削除仕様 / D-2 iPad / D-3 splash / D-4 Crashlytics を決める
                              → 必要なコード変更（A-6 含む）を済ませる
Phase R3（iOS 提出）          : B-4〜B-8 → C-1 iOS ビルド → C-2〜C-6 実機検証
                              → A-7 スクショ再生成 → B-6 App Privacy → B-12/B-13 審査運用 → 提出
Phase R4（Android 提出）      : B-9〜B-11 → C-1 Android ビルド → 実機（Google/Apple ログイン・購入）
                              → 内部テスト → 提出
```

## 3. リリース後の既知の制約（対応不要と整理済み・再掲のみ）

- レート制限は WAF が本命（Workers 側は best-effort）・解析コストは月次枠で有界
- 一覧の統計/保存枠表示は読み込み済み範囲の件数（31件超で過少。list-pagination.md 7章）
- 写真ストレージ累積は無限（月次は解析枠で有界。上限/圧縮は `[未確定]`）
- RevenueCat TRANSFER 未対応（実ペイロード採取後に実装）・sitemap 200件上限・
  特訓の外部ソルバ検出不能（許容済み）

## 4. 検証

- コード変更（A 系）は各テストで担保（purchases/PlanSheet/SettingsScreen のユニットテスト追加済み）
- C 系は実機チェックリスト（android.md §実機・expo-sdk-57.md 受け入れ条件）に従い、
  結果を各 plan に追記して `[未確定]` を `[決定]` へ更新する
