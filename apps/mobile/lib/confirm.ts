import { Alert } from "react-native";

/**
 * 破壊的操作の確認ダイアログ（局削除・半荘削除などで共用）。
 * キャンセル / 実行（destructive）の2択で、実行時のみ onConfirm を呼ぶ。
 */
export function confirmDestructive(params: {
  title: string;
  message: string;
  actionLabel?: string;
  onConfirm: () => void;
}) {
  Alert.alert(params.title, params.message, [
    { text: "キャンセル", style: "cancel" },
    { text: params.actionLabel ?? "削除", style: "destructive", onPress: params.onConfirm },
  ]);
}
