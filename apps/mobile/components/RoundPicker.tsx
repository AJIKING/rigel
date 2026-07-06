import { StyleSheet, Text, View } from "react-native";
import { colors } from "../lib/theme";
import { Segment } from "./Segment";

const WINDS = ["東", "南", "西", "北"] as const;
const NUMS = ["一", "二", "三", "四"] as const;

/**
 * 局名（東一局〜北四局 = seq 1..16）の選択。風×局数の2段セグメント。
 * 半荘内の好きな局を1つだけ作る/局順を編集するために使う。
 */
export function RoundPicker({
  value,
  onChange,
}: {
  value: number;
  onChange: (seq: number) => void;
}) {
  const windIdx = Math.min(3, Math.max(0, Math.floor((value - 1) / 4)));
  const numIdx = Math.min(3, Math.max(0, (value - 1) % 4));
  return (
    <View style={styles.wrap}>
      <View style={styles.row}>
        <Text style={styles.lbl}>場</Text>
        <Segment
          options={WINDS.map((w, i) => [String(i), `${w}場`] as const)}
          value={String(windIdx)}
          onChange={(v) => onChange(Number(v) * 4 + numIdx + 1)}
        />
      </View>
      <View style={styles.row}>
        <Text style={styles.lbl}>局</Text>
        <Segment
          options={NUMS.map((n, i) => [String(i), `${n}`] as const)}
          value={String(numIdx)}
          onChange={(v) => onChange(windIdx * 4 + Number(v) + 1)}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 8 },
  row: { flexDirection: "row", alignItems: "center", gap: 8 },
  lbl: { color: colors.w45, fontSize: 12, fontWeight: "700", width: 24 },
});
