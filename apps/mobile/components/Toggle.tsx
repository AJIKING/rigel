import { Pressable, StyleSheet, View } from "react-native";
import { colors } from "../lib/theme";

/**
 * コンパクトなトグル（ネイティブ Switch の代替）。ダークUIに合わせた小さめのピル。
 * ルール設定などの多項目リストで場所を取らない。
 */
export function Toggle({
  value,
  onChange,
  a11yLabel,
}: {
  value: boolean;
  onChange: (v: boolean) => void;
  a11yLabel: string;
}) {
  return (
    <Pressable
      style={[styles.track, value && styles.trackOn]}
      onPress={() => onChange(!value)}
      accessibilityRole="switch"
      accessibilityState={{ checked: value }}
      accessibilityLabel={a11yLabel}
      hitSlop={8}
    >
      <View style={[styles.knob, value && styles.knobOn]} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  track: {
    width: 40,
    height: 24,
    borderRadius: 12,
    padding: 2,
    justifyContent: "center",
    backgroundColor: colors.chrome3,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
  },
  trackOn: { backgroundColor: colors.accent, borderColor: colors.accent },
  knob: {
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: colors.w70,
  },
  knobOn: { backgroundColor: "#16181d", alignSelf: "flex-end" },
});
