// 写真選択（作成画面の河・手牌で共用）。
// 一度アクセスを拒否すると OS は許可ダイアログを二度と出さない（canAskAgain=false）ため、
// その場合は設定アプリへの誘導を必ず出す。無言で何も起きない状態を作らないこと。

import * as ImagePicker from "expo-image-picker";
import { Alert, Linking } from "react-native";

export interface PickedImage {
  uri: string;
  name: string;
  type: string;
}

export type PickImageResult =
  { status: "picked"; file: PickedImage } | { status: "canceled" } | { status: "denied" };

export async function pickImage(): Promise<PickImageResult> {
  const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!perm.granted) {
    if (!perm.canAskAgain) {
      // もうダイアログは出ない。設定アプリで許可してもらうしかない。
      Alert.alert(
        "写真へのアクセスが許可されていません",
        "設定アプリで rigel に写真へのアクセスを許可してください。",
        [
          { text: "キャンセル", style: "cancel" },
          { text: "設定を開く", onPress: () => void Linking.openSettings() },
        ],
      );
    }
    return { status: "denied" };
  }

  const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], quality: 0.8 });
  const asset = res.canceled ? null : res.assets[0];
  if (!asset) return { status: "canceled" };
  return {
    status: "picked",
    file: {
      uri: asset.uri,
      name: asset.fileName ?? "photo.jpg",
      type: asset.mimeType ?? "image/jpeg",
    },
  };
}
