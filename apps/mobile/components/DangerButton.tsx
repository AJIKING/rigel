import { Pressable, StyleSheet, Text } from "react-native";
import { colors } from "../lib/theme";

/** 破壊的操作のボタン（朱のアウトライン）。局削除・半荘削除・牌削除で共用。 */
export function DangerButton({
  label,
  onPress,
  disabled = false,
  a11yLabel,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  a11yLabel?: string;
}) {
  return (
    <Pressable
      style={[styles.btn, disabled && styles.off]}
      disabled={disabled}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={a11yLabel ?? label}
    >
      <Text style={[styles.text, disabled && styles.textOff]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  btn: {
    paddingVertical: 9,
    paddingHorizontal: 16,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.vermilion,
    alignItems: "center",
    justifyContent: "center",
  },
  off: { borderColor: colors.line },
  text: { color: colors.vermilion, fontWeight: "800", fontSize: 13 },
  textOff: { color: colors.w45 },
});
