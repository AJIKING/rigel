# Plan: クライアントエラー可視化（Firebase Crashlytics）＋ Analytics フェーズ2完遂

> 状態: **承認済み（2026-08-05 オーナー「crashlytics 進めて」）。コード側（Task 2〜6）実装完了。
> 残 = Task 1/7（Codemagic ビルド共存・実機の可読性検証。release.md C-1 に同乗）と Task 8/9。**
> 背景: 2026-08-01 の実機障害（写真解析の「通信に失敗しました」）で、mobile の
> `catch {}` がエラー本体を握りつぶし、原因特定に大きく遠回りした（真因は
> expo/fetch と RN 式 FormData の非互換＝JS 例外。サーバーに届かないためサーバー
> ログにも出ない）。実機の JS エラーを見る手段が無いことが構造的な穴。
> 方針合意（2026-08-01 オーナー）: ベンダーを増やさず **Firebase 一本**
> （Analytics=計画済み + Crashlytics=本 Plan）。Sentry は見送り・後付け可能。
> 関連: [analytics.md](analytics.md)（フェーズ2＝mobile ビルド検証待ち。本 Plan が完遂を含む）

## 1. 目的（なぜ）

実機で起きたクライアントエラー（JS 例外・ネイティブクラッシュ）をダッシュボードで
見られるようにし、「画面の汎用メッセージしか手掛かりが無い」状態をなくす。
サーバー側（Workers tail + Gemini エラーボディログ）は整備済みで、残る盲点が
クライアント側。ハーネスの「観測」を mobile まで伸ばす。

## 2. ハーネス構成要素

**観測**（エラーの可視化・カスタムキーによる文脈付与）。

## 3. スコープ

- やること:
  - `@react-native-firebase/crashlytics` 追加（既存 RNFB app/analytics と同ファミリー）
  - 未捕捉 JS エラー / ネイティブクラッシュの自動記録（RNFB の既定機能の有効化確認）
  - `lib/crash.ts` に `trackError(e, context)` を新設し、主要な `catch` に計装
    （Capture の解析・ProblemEdit の AI 再現・auth・billing・保存系）。
    context は **固定語彙のみ**（screen / op の enum。自由文字列を型で締め出す＝
    ANALYTICS_EVENTS と同じ流儀で @rigel/ui に置く）
  - dev（`__DEV__`）では送信しない
  - iOS dSYM アップロードの Codemagic 設定（Android の mapping は plugin が自動）
  - **analytics.md フェーズ2の残作業を同じビルド検証で完遂**（GoogleService
    ファイル配置 → Codemagic ビルド → DebugView 確認 → 残イベント結線）
  - ストア申告の更新（App Privacy / データセーフティに Crashlytics 分を追記）
- やらないこと（非対象）:
  - Sentry 導入（見送り [決定 2026-08-01]。再検討条件は 10章）
  - web のクライアントエラー計測（サーバーは Workers Observability 済み。web は将来）
  - Firebase Performance / ANR 詳細分析
  - エラー時のユーザー向け UI 変更（表示文言は現状維持。計測を足すだけ）

## 4. `[決定]` / `[未確定]` の仕分け

- 依拠する `[決定]`:
  - 計測は GA4/Firebase に統一・**PII を送らない・広告用途に使わない**（analytics.md 2章）
  - user_id は当面送らない（必要になったら内部 UUID のみ検討。Crashlytics も同じ扱い）
  - 広告ID収集は無効（firebase.json 設定済み。Crashlytics は広告IDを使わない）
- 触れる `[未確定]`（本実装の前に検証タスクを置く）:
  - **RNFB + Expo SDK 57 + New Architecture + iOS static frameworks + RevenueCat Pods の
    ビルド共存**（analytics.md フェーズ2の最大リスクと同一。Crashlytics を足した状態で
    Codemagic ビルドが通るかを最初に検証）
  - **release ビルドの JS エラーの可読性**（Crashlytics は JS ソースマップ非対応。
    エラーメッセージ＋カスタムキーで運用が成立するかを、実機からテスト送信して確認）

## 5. 影響範囲

- 触るパッケージ/アプリ: apps/mobile（app.json / firebase.json / lib/crash.ts 新規 /
  各 screen の catch）、packages/ui（エラー文脈の固定語彙）、Codemagic 設定（dSYM）
- 依存追加: `@react-native-firebase/crashlytics`（RNFB ファミリー。新ベンダーなし）
- スキーマ（背骨）への影響: なし

## 6. 信頼まわり

- プライバシー: エラーレポートに PII を載せない。`trackError` の context は固定語彙のみを
  型で強制。エラーメッセージに牌譜内容・handle・メール・トークンが混入しない設計を
  計装箇所ごとに確認（Authorization はヘッダ送信なので URL/メッセージに出ない）。
- Zod 検証 / null 白旗 / 課金カウント / 画像非保存: 該当なし（動作を変えない計測のみ。
  課金コードに触れる計装は挙動不変をテストで担保）。

## 7. 受け入れ条件（= 最初に書く失敗テストの集合）

- [x] `trackError(e, {screen, op})` が crashlytics の `recordError` を呼び、カスタムキーを設定する
- [x] context の語彙は型で固定され、自由文字列はコンパイルエラーになる（@rigel/ui crash.ts）
- [x] crashlytics 呼び出しが例外を投げても `trackError` は握りつぶす（アプリを壊さない）
- [x] `__DEV__` では記録しない
- [x] CaptureScreen の解析 catch が `trackError` を呼ぶ（画面表示は従来どおり）
- [x] ProblemEditScreen / auth（Login。キャンセルは記録しない）/ billing（purchases・portal）/
      GameDetail 再解析 / 手入力作成 の catch も同様
- [ ] （実機・ビルド検証）テストクラッシュと `recordError` が Firebase コンソールに表示される

## 8. Task 分解（1つ＝1つの振る舞い）

1. [ ] **[未確定検証] ビルド共存**: GoogleService 2ファイル配置（オーナー）＋ crashlytics 依存・
   config plugin（済）→ Codemagic で iOS/Android ビルドが通ることを確認（analytics.md 残作業1-2と同時）
2. [x] @rigel/ui にエラー文脈の固定語彙（screen/op）→ 型テスト＋語彙のスナップ（2026-08-05）
3. [x] `lib/crash.ts` の `trackError`（recordError 呼び出し・カスタムキー・no-throw・dev 無効）
4. [x] CaptureScreen 解析 catch の計装（失敗時に trackError が呼ばれるテスト付き）
5. [x] ProblemEdit / auth（Apple はキャンセル除外）/ billing（purchase・restore・portal・
   logIn/logOut）/ GameDetail 再解析 / 手入力作成 catch の計装
6. [x] Codemagic: iOS dSYM アップロードステップ追加（archive/GoogleService 不在時は警告スキップ）
7. [ ] **[未確定検証] 実機**: テストクラッシュ + recordError 送信 → コンソールで可読性確認 →
   結果を本 Plan と analytics.md に反映（`[決定]` 化）
8. [ ] analytics.md 残作業: DebugView 確認・analyze_kifu / save_kifu 等の残イベント結線
   （イベントごとに 1 Task・既存 trackEvent を差すだけ）
9. [ ] ストア申告更新（App Privacy / データセーフティ）・RevenueCat → Firebase 連携 ON

## 9. 検証 / eval 方針

- ゲート: typecheck / lint / format / test（mobile は jest-expo。crashlytics はモック）
- ビルド検証: Codemagic（iOS static frameworks + RNFB + RevenueCat Pod の共存が最大リスク）
- AI 精度: 該当なし

## 10. リスク / 未決事項

- iOS の Pod 干渉でビルドが壊れる可能性（フェーズ2から持ち越しの最大リスク。Task 1 で先に潰す）
- JS スタックが難読のままで原因特定に不足する場合 → **Sentry 後付けを再検討**する条件:
  「メッセージ＋カスタムキーで特定できないエラーが繰り返し発生したとき」
- Expo prebuild（CNG）と firebase.json / dSYM スクリプトの相性は Codemagic 上でのみ検証可能

## 11. 完了の定義

- [ ] 全受け入れ条件が緑
- [ ] 検証ゲート通過＋ Codemagic ビルド通過
- [ ] 実機のテストエラーが Firebase コンソールで確認できた（スクリーンショット添付）
- [ ] `[未確定]`（ビルド共存・可読性）の結論を本 Plan / analytics.md に反映済み
- [ ] ストア申告更新済み
