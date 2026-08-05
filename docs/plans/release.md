# Plan: リリース準備（ストア提出 + 本番公開）

> 起案: 2026-08-05（オーナー指示「リリース準備始めよう」）。3方向の全面棚卸し
> （デプロイ/インフラ・ストア提出・残タスク/未確定）の結果を1枚に統合した**マスターチェックリスト**。
> 個別の手順・理由は各 plan / DEPLOY.md が真実源で、本書はそこへの索引と順序付けを担う。
> 現在地: web は raisha.jp で本番稼働中（手動 promote 制）。mobile は iOS=TestFlight 配布まで、
> Android=AAB アップロードまで実績あり（SDK 57 移行後の再ビルドが未）。
>
> **[決定] 2026-08-05 オーナー「本当にやる必要がある対応だけに限定」**: 提出を block しない
> 項目（WAF・AI Gateway 確認・GA4 ほか）は「後回し」に落とした。**実行するのは 2章の
> 最小リリースパスのみ**。1章は元の全量棚卸し（記録・後回しの受け皿）として残す。

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
- [x] A-6. **splash** — ダーク背景 `#0f1115` の無地のみ（2026-08-05 オーナー指示で
      アイコン表示を撤去。起動後すぐアプリ側のローディング表示へ切り替わる）。
      ※ Android 12+ は OS 仕様で起動時に必ずアプリアイコンが小さく出る（消せない）。
      iOS は完全に無地。見た目の最終確認は C-1 のビルドで
- [ ] A-7. ストアスクショの再生成（`pnpm shots`。2026-07-30 生成のまま → 特訓開放・
      ランキング・マイページ統計変更が反映されていない）。**提出直前に一度回すのが安全**

### B. オーナーのコンソール/運用作業（コード外）

**Cloudflare（→ すべて後回し [決定] 2026-08-05）**
- [ ] B-1. 【後回し】WAF レートリミットルール（`api.raisha.jp` の `/auth/*` IP 10回/分 Block ほか。
      Workers 側は best-effort と実測済み。ユーザーが付いて攻撃価値が出る前に入れる）
- [ ] B-2. 【後回し】AI Gateway のキャッシュ/ログ設定確認（撮影画像がゲートウェイ側に残らないか。
      プライバシーポリシーとの整合確認。security-hardening P7）
- [ ] B-3. 【後回し】GA4 プロパティ作成 → `NEXT_PUBLIC_GA_MEASUREMENT_ID` → web promote
      （計測が無くてもリリースは成立する）

**Apple Developer / App Store Connect**（docs/plans/sign-in-with-apple.md・android.md §12-B）
- [ ] B-4. **App ID（jp.co.plaria.rigel）に Sign in with Apple capability を有効化**
      （iOS の署名プロファイル生成に必要＝最小パスに含む）。
      Services ID `jp.co.plaria.rigel.web`（ドメイン検証・Return URL）は web/Android の
      Apple ログイン用 → 【後回し】（iOS 先行では不要）
- [ ] B-5. 【後回し】GitHub Secrets `APPLE_TEAM_ID`/`APPLE_KEY_ID`/`APPLE_PRIVATE_KEY`
      （退会時 revoke 用。未設定でもスキップされるだけ＝実装済みの best-effort）＋
      Variables `NEXT_PUBLIC_APPLE_CLIENT_ID`（web の Apple ボタン）
- [ ] B-6. App Store Connect: アプリ登録・定期購読商品（`rigel.next.monthly` ¥700 /
      `rigel.pro.monthly` ¥1,800）・App Privacy 申告（docs/plans/analytics.md の申告内容＋
      /privacy の記載が元ネタ）

**Firebase / Codemagic**（docs/plans/analytics.md・codemagic.yaml 冒頭コメント）
- [x] B-7. `GoogleService-Info.plist` / `google-services.json` の配置（**2026-08-05 オーナー配置済み**）
- [ ] B-8. 【後回し・Android フェーズ】Codemagic `rigel_mobile_env` に `EXPO_PUBLIC_APPLE_CLIENT_ID`
      と `REVENUECAT_ANDROID_KEY` を追加（iOS ビルドは既存の変数群のままで可）

**Google Play / RevenueCat（Android。iOS 先行なら後回し可）**（docs/plans/android.md §12-C/D）
- [ ] B-9. Play Console: 内部テスト・定期購読商品（価格一致必須）・データセーフティ申告
- [ ] B-10. OAuth の SHA-1 **二重登録**（アップロード鍵＋Play アプリ署名鍵。`[未確定] B`）
- [ ] B-11. RevenueCat: Android SDK キー発行・Play 連携（サービスアカウント）

**審査運用（提出直前）**（docs/plans/review-login.md・store-listing.md）
- [ ] B-12. `REVIEW_LOGIN_SECRET` 投入 → 実機で審査ユーザー作成 → D1 で pro 化 →
      サンプルデータ投入 → 審査メモ記載（審査完了後に secret 削除）
- [ ] B-13. 【後回し】審査期間中の `REVENUECAT_ALLOW_SANDBOX=true` の要否（審査で IAP を
      指摘されたら入れる。審査ユーザーは D1 で pro 化済みなので機能審査は通る）

### C. 実機検証（Codemagic 再ビルドが前提）

- [ ] C-1. **Codemagic 再ビルド（iOS/Android）**（SDK 57 移行後初。expo-sdk-57.md Task 8。
      今回の A-1〜A-4 も乗る。iOS static frameworks × Firebase/RevenueCat の Pod 干渉が最大リスク）
- [ ] C-2. **`toAbsoluteSeat` の回転方向**（東家手前の実写で目視。誤ると全席90°ズレ。
      設計 9章 #1・security-hardening P7。**確定したら設計ドキュメントを [決定] に更新**）
- [ ] C-3. 中核ループの実機スモーク（撮影→解析→保存→閲覧→修正。async-analysis Task 10 の
      アプリ開閉完走・photo-retention Task 13 の写真 E2E を含む）
- [ ] C-4. 【後回し・ビルドのついでに目視する程度】エッジトゥエッジ（expo-sdk-57.md Task 5）・
      特訓 Segment の狭幅表示・web ヘッダ 360px（quiz-open-and-ranking.md 残）
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
- [ ] D-5. 【後回し [決定] 2026-08-05】AI 精度の実写再計測（設計 9章 #3）。C-2/C-3 の実機
      スモークで実写を通すので、致命的なズレはそこで見える

## 2. 最小リリースパス（[決定] 2026-08-05「本当に必要な対応だけに限定」。実行はこれだけ）

1. [ ] **api promote → web promote**（GitHub Actions 手動実行。migration 0019/0020 は deploy が
       自動適用。モバイルのバイナリは新 API 形（{items, nextCursor}）前提なので api が先）
2. [ ] **Apple Developer**: App ID `jp.co.plaria.rigel` に Sign in with Apple capability を有効化
       （署名プロファイル生成に必要。これだけ。Services ID / .p8 は後回し）
3. [ ] **App Store Connect**: アプリ登録・定期購読商品2つ（`rigel.next.monthly` ¥700 /
       `rigel.pro.monthly` ¥1,800・RevenueCat の Offerings と紐付け）・App Privacy 申告
       （/privacy の記載が元ネタ）
4. [ ] **Codemagic `ios-testflight` 実行**（SDK 57 移行後初ビルド。Pod 共存・splash・
       写真権限文言はここで確認できる）
5. [ ] **実機スモーク（TestFlight）**: 中核ループ（撮影→解析→保存→閲覧→修正）・
       **`toAbsoluteSeat` の回転方向**（実写1枚で目視。誤ると全席90°ズレ＝コア品質）・
       Google/Apple ログイン・購入復元
6. [ ] **審査用ログイン運用**（review-login.md）: `REVIEW_LOGIN_SECRET` 投入 → 実機で
       審査ユーザー作成 → D1 で pro 化 → サンプルデータ投入 → 審査メモ記載
7. [ ] **提出**（スクショは既存 7/30 版で可。UI 乖離が気になれば `pnpm shots` で再生成）

Android（Phase R4）は iOS 公開後: B-9〜B-11 → Android ビルド → 実機 → 内部テスト → 提出。
「後回し」に落としたもの（B-1/B-2/B-3/B-5/B-8/B-13/C-4/D-5・Services ID）は 1章に理由つきで
残してあり、リリース後に必要になったタイミングで拾う。

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
