import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { QUIZ_RANKING_LINK_LABEL } from "@rigel/ui";
import { Pressable, StyleSheet, Text, type StyleProp, type ViewStyle } from "react-native";
import type { RootStackParamList } from "../lib/navigation";
import { colors } from "../lib/theme";

/**
 * ランキング画面への導線ピル（特訓タブの種目選択・マイページ特訓セグメントで共用。
 * 操作要素なのでアクセント系の線。配置=alignSelf/margin は呼び出し側が style で渡す）。
 */
export function RankingLink({ style }: { style?: StyleProp<ViewStyle> }) {
  const nav = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  return (
    <Pressable
      style={({ pressed }) => [styles.pill, style, pressed && styles.pressed]}
      onPress={() => nav.navigate("Ranking")}
      accessibilityRole="button"
    >
      <Text style={styles.text}>{QUIZ_RANKING_LINK_LABEL}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  pill: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(255,158,69,0.45)",
    borderRadius: 999,
    paddingVertical: 6,
    paddingHorizontal: 14,
  },
  pressed: { transform: [{ scale: 0.97 }] },
  text: { color: colors.accent, fontSize: 12, fontWeight: "800" },
});
