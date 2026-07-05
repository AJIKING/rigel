import { Pressable, StyleSheet, Text } from "react-native";
import { colors, radius } from "../lib/theme";

/**
 * 選択チップ（役・符・ルールプリセット・ピッカーのトグルで共用）。
 * on でアクセント表示、disabled で薄く（押せない）。
 */
export function Chip({
  label,
  on = false,
  disabled = false,
  onPress,
  a11ySelected = true,
}: {
  label: string;
  on?: boolean;
  disabled?: boolean;
  onPress?: () => void;
  /** accessibilityState.selected を付けるか（単なるボタン用途では false）。 */
  a11ySelected?: boolean;
}) {
  return (
    <Pressable
      style={[styles.chip, on && styles.on, disabled && styles.disabled]}
      disabled={disabled || !onPress}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={a11ySelected ? { selected: on } : undefined}
    >
      <Text style={[styles.text, on && styles.textOn]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  chip: {
    paddingVertical: 7,
    paddingHorizontal: 10,
    borderRadius: radius.base,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
    backgroundColor: colors.chrome2,
  },
  on: { backgroundColor: colors.accentSoft, borderColor: colors.accent },
  disabled: { opacity: 0.4 },
  text: { color: colors.w70, fontWeight: "700", fontSize: 12 },
  textOn: { color: colors.accent },
});
