# Plan: Expo SDK 52 → 57 移行（mobile 一式アップグレード）

> 状態: **未着手／優先度引き上げ（2026-07-27）**。
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
- `[未確定]`（着手時に検証）:
  - ~~現状の targetSdkVersion が本当に 34 か~~ → **[決定] 34 で確定**（2026-07-27 実測。
    prebuild 生成の android/build.gradle: min 24 / compile 35 / **target 34**）。
  - `react-native-purchases` の SDK 57 互換版（RN 0.86 / New Architecture）
  - jest-expo 57 + jest 30 でモバイルテスト一式が緑になるか
  - エッジトゥエッジ既定化で崩れる画面の範囲（`SafeAreaView`/`useSafeAreaInsets` を
    使っているのは 7 ファイルのみ。使っていない画面ほど危ない）

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
1. [ ] `npx expo install expo@^57 --fix` 相当で依存一括解決 → typecheck の破壊箇所を列挙
2. [ ] コード追随（1振る舞い=1コミットで破壊的変更を潰す）
3. [ ] jest-expo 57 / jest 30 へテスト基盤更新 → 全テスト緑
4. [ ] `react-native-purchases` の互換版へ更新（購入導線のテストが緑のまま）
5. [ ] エッジトゥエッジ追随（全画面の目視 → 崩れた画面の余白を直す）
6. [ ] `with-openiap-pin.js` 削除・override 撤去検証・**`android.kotlinVersion: "1.9.25"` の削除**
       （SDK 52 の版ズレ対処。残すと古い Kotlin への固定になる。台帳 07 参照）
7. [ ] codemagic.yaml の Xcode/Node 版を SDK 57 要件へ更新
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
