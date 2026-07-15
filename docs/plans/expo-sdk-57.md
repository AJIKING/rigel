# Plan: Expo SDK 52 → 57 移行（mobile 一式アップグレード）

> 状態: **起案（未着手）**。課金ストア対応（TestFlight / Play 内部テスト配布）が安定してから着手する。
> 関連: [07 依存固定台帳](../開発ガイド/07_依存固定台帳.md) / [billing-revenuecat](billing-revenuecat.md)

## 1. 目的（なぜ）

mobile の凍結枠（Expo SDK 52 ペア一式）を最新 SDK に揃え、SDK 52 起因の回避策
（`@expo/cli>tar` override・openiap 1.1.9 固定・React 18/19 混在・jest 29 縛り）を解消する。
ストア審査要件（新しい Xcode / targetSdkVersion）への追随でもある。

## 2. ハーネス構成要素

制約（依存の土台）。AI パイプラインには触れない。

## 3. スコープ

- やること:
  - expo 52→57 / react-native 0.76→SDK 57 対応版 / react 18.3→19 を `npx expo install` の解決に従い一括更新
  - expo-*（auth-session, crypto, image-picker, secure-store, status-bar, web-browser）・
    screens / svg / safe-area-context・jest-expo / babel-preset-expo・@testing-library/react-native・react-test-renderer を同時更新
  - expo-iap を SDK 57 互換版へ → `with-openiap-pin` プラグインと `@expo/cli>tar` override の撤去可否を確認
  - `@types/react` override・`react` バージョン差の整理（web と 19 に統一）
  - 破壊的変更の追随（react-navigation / RN New Architecture まわり）
- やらないこと:
  - 機能追加・UI 変更（挙動は現状維持が完了条件）
  - web / api への変更（React 型の統一を除く）

## 4. `[決定]` / `[未確定]` の仕分け

- 依拠する `[決定]`: モバイルは React Native (Expo)（設計 6章）
- `[未確定]`（着手時に検証）:
  - expo-iap の SDK 57 互換版と openiap の対応ペア（固定撤去できるか）
  - jest-expo 57 + jest 30 でモバイルテスト一式が緑になるか

## 5. 影響範囲

- apps/mobile 全体・ルート pnpm.overrides（@types/react / @expo/cli>tar）・codemagic.yaml（Node/Xcode 版）
- スキーマ（背骨）への影響: なし

## 6. 信頼まわり

該当なし（課金は expo-iap の互換確認のみ。カウント・検証ロジックには触れない）。

## 7. 受け入れ条件

- [ ] `pnpm --filter mobile typecheck / lint / test` 全緑（jest-expo 57 + jest 30）
- [ ] `npx expo prebuild --platform android/ios` が override なしで成功
- [ ] Codemagic ios-testflight / android-googleplay が成功し、実機で 撮影→解析→保存→再生→何切る回答 が通る
- [ ] 台帳から `@expo/cli>tar`・openiap 固定・React 18/19 混在の項を削除（or 更新）できる

## 8. Task 分解

1. [ ] `npx expo install expo@^57 --fix` 相当で依存一括解決 → typecheck の破壊箇所を列挙
2. [ ] コード追随（1振る舞い=1コミットで破壊的変更を潰す）
3. [ ] jest-expo 57 / jest 30 へテスト基盤更新 → 全テスト緑
4. [ ] expo-iap 互換版へ更新 → openiap 固定・tar override の撤去検証
5. [ ] Codemagic 実ビルド（iOS/Android）→ TestFlight / 内部テストで実機確認
6. [ ] 台帳・CLAUDE.md の固定記述を更新

## 9. 検証 / eval 方針

ゲート＝mobile の typecheck/lint/test ＋ Codemagic 実ビルド＋実機スモーク（中核ループ一周）。

## 10. リスク / 未決事項

- RN New Architecture 既定化に伴うネイティブモジュールの互換（screens / svg / expo-iap）
- React 19 化で @rigel/ui 共有コードの型が web と衝突しないか（overrides 撤去順序）

## 11. 完了の定義

- [ ] 受け入れ条件が全て緑
- [ ] 台帳の凍結枠「Expo SDK 52 一式」を削除し、解消された override を撤去済み
