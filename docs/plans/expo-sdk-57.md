# Plan: Expo SDK 52 → 57 移行（mobile 一式アップグレード）

> 状態: **実装完了（2026-07-27）。残タスクは Codemagic 実ビルドと実機スモーク**（Task 8）。
> 当初は「課金ストア対応が安定してから」の後回し枠だったが、**Play の targetSdkVersion 期限が
> それを追い越した**ため、Android リリースの前提条件として先に片付ける（下記 §1）。
> 関連: [07 依存固定台帳](../開発ガイド/07_依存固定台帳.md) / [android.md](android.md) /
> [billing-revenuecat](billing-revenuecat.md)

## 1. 目的（なぜ）

**第一に、Android を Google Play に出せる状態にする。**

| | targetSdkVersion |
|---|---|
| 現状（Expo SDK 52 / RN 0.76） | **34**（SDK 52 の changelog は min 24・compile 35 の引き上げだけを告知し、target には触れていない） |
| Play の下限（現在） | **35** |
| Play の下限（**2026-08-31 以降**の新規・更新） | **36** |

34 のままではアップロードが弾かれる。SDK 54 以降は target 36 が既定なので、SDK 57 へ移れば
期限を跨げる。**暫定案（`expo-build-properties` で 35 に上げるだけ）は採らない** —
API 35 を狙うと Android 15 でエッジトゥエッジが強制されて UI 修正が必要になり、
そのうえ8月末にもう一度やり直しになるため、同じ手間なら 36 まで行く。

副次的に、SDK 52 起因の回避策（`@expo/cli>tar` override・React 18/19 混在・jest 29 縛り）も解消する。

## 2. ハーネス構成要素

制約（依存の土台）。AI パイプラインには触れない。

## 3. スコープ

- やること:
  - expo 52→57 / react-native 0.76→SDK 57 対応版（0.86）/ react 18.3→19.2 を
    `npx expo install` の解決に従い一括更新
  - expo-\*（auth-session, crypto, image-picker, secure-store, status-bar, web-browser）・
    screens / svg / safe-area-context・jest-expo / babel-preset-expo・
    @testing-library/react-native・react-test-renderer を同時更新
  - `react-native-purchases` の SDK 57 互換版への追随
  - **エッジトゥエッジ既定化への追随**（SDK 54 以降は常時有効・無効化不可）。
    ステータスバー／ナビゲーションバーに UI が潜り込まないことを全画面で確認する
  - `@types/react` override・React バージョン差の整理（web と 19 に統一）
  - 破壊的変更の追随（react-navigation / New Architecture まわり）
  - 使われていない `plugins/with-openiap-pin.js` の削除
- やらないこと:
  - 機能追加・UI 変更（**挙動は現状維持が完了条件**。エッジトゥエッジ対応の余白調整は除く）
  - web / api への変更（React 型の統一を除く）
  - Play Billing の商品登録・Apple ログインの Android 対応（[android.md](android.md) の担当）

## 4. `[決定]` / `[未確定]` の仕分け

- 依拠する `[決定]`: モバイルは React Native (Expo)（設計 6章）
- `[未確定]` の検証結果（2026-07-27）:
  - ~~現状の targetSdkVersion が本当に 34 か~~ → **[決定] 34 で確定**（実測）。移行後は
    RN 0.86 のバージョンカタログで **target 36 / compile 36 / Kotlin 2.1.20** をソース確認済み。
  - ~~react-native-purchases の互換版~~ → **10.x が現行最新**（10.4系のまま。API 変更なし・
    テスト緑。ネイティブ互換の最終確認は Codemagic ビルド）
  - ~~jest-expo 57 + jest 30~~ → **jest-expo 57 の内部は jest 29 世代のまま**（babel-jest ^29）。
    jest 30 化は依然ブロック＝**jest 29 を維持**（台帳の保留中に記録）
  - ~~RNTL の React 19 対応~~ → **v13.3.3 を採用**（同期 API のまま）。v14 は render が
    async 化する意味論変更なので独立作業に切り出した（台帳の保留中）
  - エッジトゥエッジで崩れる画面の範囲 → **残タスク**（実機でしか確定しない。Task 8 と同時）

## 5. 影響範囲

- apps/mobile 全体・ルート pnpm.overrides（@types/react / @expo/cli>tar）・
  codemagic.yaml（Node / Xcode 版。SDK 57 は Xcode 26.4+ が要件）
- スキーマ（背骨）への影響: なし

## 6. 信頼まわり

該当なし（課金は `react-native-purchases` の互換確認のみ。カウント・検証ロジックには触れない）。

## 7. 受け入れ条件

- [ ] 生成された `android/gradle.properties` の `android.targetSdkVersion` が **36**
- [ ] `pnpm --filter mobile typecheck / lint / test` 全緑（jest-expo 57 + jest 30）
- [ ] `npx expo prebuild --platform android/ios` が override なしで成功
- [ ] Codemagic ios-testflight / android-googleplay が成功
- [ ] 実機（iOS/Android 両方）で 撮影→解析→保存→再生→何切る回答→特訓 が通る
- [ ] **エッジトゥエッジ**: 全画面でステータスバー／ナビゲーションバーに
      操作要素・テキストが潜り込んでいない
- [ ] 台帳から `@expo/cli>tar`・React 18/19 混在の項を削除（or 更新）できる
- [ ] `plugins/with-openiap-pin.js` が消えている

## 8. Task 分解

0. [x] **現状の targetSdkVersion を実測** → **34 で確定**（2026-07-27。§4 に記録済み）
1. [x] 依存一括解決（expo 57.0.8 / RN 0.86.0 / react 19.2.3。typecheck の破壊は 25 件→分類3種）
2. [x] コード追随 — 本体コードの破壊は **`StyleSheet.absoluteFillObject` の型削除のみ**
       （`absoluteFill` へ置換。中身は同一オブジェクト）。他は全てテスト型定義由来だった
3. [x] テスト基盤更新（jest-expo 57 + RNTL 13.3.3 + react-test-renderer 19.2.3。jest は 29 維持）
       → **mobile 276 テスト全緑**
4. [x] `react-native-purchases` は 10.x が現行最新のため据え置き（テスト緑）
5. [ ] エッジトゥエッジ追随（**実機でのみ確定**。Task 8 のビルドで全画面を目視）
6. [x] 撤去完了: `with-openiap-pin.js`・`@expo/cli>tar` override（prebuild が override 無しで
       成功することを確認）・`@types/react` override・`android.kotlinVersion` pin
7. [x] codemagic.yaml は変更不要（`xcode: latest` が 26.4+ を満たす想定・Node 24 は要件 22.13+ を満たす。
       ダメなら Task 8 の iOS ビルドで露見する）
8. [ ] Codemagic 実ビルド（iOS/Android）→ TestFlight / 内部テストで実機確認
9. [ ] 台帳・CLAUDE.md の固定記述を更新

## 9. 検証 / eval 方針

ゲート＝mobile の typecheck/lint/test ＋ Codemagic 実ビルド＋実機スモーク（中核ループ一周）。
AI 精度 eval: 該当なし。

## 10. リスク / 未決事項

- **期限が近い**（新規・更新の API 36 要件は 2026-08-31。延長申請は 11/1 まで可）。
  移行が間に合わない場合の退避は「35 で暫定リリース → 8月末までに 36」だが、
  エッジトゥエッジ対応を2回やることになる。
- New Architecture 既定化に伴うネイティブモジュールの互換（screens / svg / react-native-purchases）
- React 19 化で @rigel/ui 共有コードの型が web と衝突しないか（overrides 撤去順序）
- iOS 側の巻き添え: SDK 57 は Xcode 26.4+ が要件。Codemagic の `xcode: latest` で足りるはずだが、
  iOS ビルドが道連れで壊れうる（**Android の都合で iOS のリリース経路も動く**点に注意）

## 11. 完了の定義

- [ ] 受け入れ条件が全て緑
- [ ] 台帳の凍結枠「Expo SDK 52 一式」を削除し、解消された override を撤去済み
- [ ] Play 内部テストへ AAB が上がっている
