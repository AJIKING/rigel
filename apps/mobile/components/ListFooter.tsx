// FlatList のフッタ（追加読み込み中スピナー / 失敗の文言。use-load-more とセット）。
// 失敗を無音にしない: 「これで全部」と「読み込めなかった」を利用者が区別できるようにする
// （文言は web と共通の LIST_LOAD_MORE_ERROR_MESSAGE。スクロールし直しで再試行される）。

import { LIST_LOAD_MORE_ERROR_MESSAGE } from "@rigel/ui";
import { ActivityIndicator, StyleSheet, Text } from "react-native";
import { colors } from "../lib/theme";

export function ListFooter({
  loadingMore,
  moreFailed,
}: {
  loadingMore: boolean;
  moreFailed: boolean;
}) {
  if (loadingMore) return <ActivityIndicator style={styles.footer} color={colors.accent} />;
  if (moreFailed) {
    return (
      <Text style={styles.err} accessibilityRole="alert">
        {LIST_LOAD_MORE_ERROR_MESSAGE}
      </Text>
    );
  }
  return null;
}

const styles = StyleSheet.create({
  footer: { paddingVertical: 14 },
  err: { color: colors.danger, fontSize: 12, textAlign: "center", paddingVertical: 14 },
});
