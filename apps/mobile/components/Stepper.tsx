import { Pressable, StyleSheet, Text, View } from "react-native";
import { colors, radius } from "../lib/theme";

/**
 * −/＋ で数値を増減する行（局情報の本場/供託/巡目、和了のドラ枚数などで共用）。
 * min/max でクランプする。web の Stepper と同等。
 */
export function Stepper({
  label,
  unit,
  value,
  min = 0,
  max = 99,
  onChange,
}: {
  label: string;
  unit?: string;
  value: number;
  min?: number;
  max?: number;
  onChange: (v: number) => void;
}) {
  return (
    <View style={styles.row}>
      <Text style={styles.label}>{label}</Text>
      <View style={styles.ctrl}>
        <Pressable
          style={styles.btn}
          onPress={() => onChange(Math.max(min, value - 1))}
          accessibilityRole="button"
          accessibilityLabel={`${label}を減らす`}
        >
          <Text style={styles.btnText}>−</Text>
        </Pressable>
        <Text style={styles.value}>
          {value}
          {unit ?? ""}
        </Text>
        <Pressable
          style={styles.btn}
          onPress={() => onChange(Math.min(max, value + 1))}
          accessibilityRole="button"
          accessibilityLabel={`${label}を増やす`}
        >
          <Text style={styles.btnText}>＋</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 },
  label: { color: colors.w70, fontSize: 13 },
  ctrl: { flexDirection: "row", alignItems: "center", gap: 10 },
  btn: {
    width: 40,
    height: 36,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.base,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
    backgroundColor: colors.chrome2,
  },
  btnText: { color: colors.accent, fontWeight: "800", fontSize: 16 },
  value: {
    color: colors.white,
    fontWeight: "700",
    fontSize: 13,
    minWidth: 48,
    textAlign: "center",
  },
});
