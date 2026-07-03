import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { colors } from "../lib/theme";

/**
 * 画面中央のローディング/メッセージ表示（一覧・ビューアの loading/empty/not-found 共通）。
 * `loading` ならスピナー、そうでなければ `message` を中央に出す。
 */
export function CenterState({ loading, message }: { loading?: boolean; message?: string }) {
  return (
    <View style={styles.center}>
      {loading ? (
        <ActivityIndicator color={colors.accent} />
      ) : (
        <Text style={styles.message}>{message}</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
    backgroundColor: colors.bg,
  },
  message: { color: colors.w45, textAlign: "center", lineHeight: 22 },
});
