import { StyleSheet, Text, View } from "react-native";
import { colors } from "../lib/theme";

/** 画面上部のタイトルバー（設定・一覧で共通）。 */
export function AppBar({ title, right }: { title: string; right?: React.ReactNode }) {
  return (
    <View style={styles.bar}>
      <Text style={styles.title}>{title}</Text>
      <View style={styles.sp} />
      {right}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: "row",
    alignItems: "center",
    height: 50,
    paddingHorizontal: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.line2,
  },
  title: { color: colors.white, fontWeight: "800", fontSize: 16 },
  sp: { flex: 1 },
});
