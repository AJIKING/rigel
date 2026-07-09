// RevenueCat の Public SDK キー（プラットフォーム別）。
// EXPO_PUBLIC_* はビルド時に静的展開されるためリテラルで参照する（動的キー参照は不可）。
// テストではこのモジュールをモックして有効/無効を切り替える（env の実行時代入は
// babel の静的展開により効かない）。

import { Platform } from "react-native";

export function revenueCatApiKey(): string {
  if (Platform.OS === "ios") return process.env.EXPO_PUBLIC_REVENUECAT_IOS_KEY ?? "";
  if (Platform.OS === "android") return process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_KEY ?? "";
  return "";
}
