import { Pressable, StyleSheet, Text, View } from "react-native";
import { colors, radius } from "../lib/theme";

/**
 * 単一選択のセグメント（編集画面の親/席/結果/下書き切替・ピッカーのスート切替で共用）。
 * options は [値, 表示ラベル] の組。compact はラベルが長い行（席=自風併記など）用。
 *
 * ⚠️ ボタンは flex:1 で「親の幅」に等分に広がる設計。内容幅に縮むラッパー
 * （alignSelf:"flex-start" など）に入れると幅がゼロに潰れて表示が崩れる。
 * 幅を持つ行（flexDirection:"row" ＋ maxWidth 等）か全幅の列に置くこと。
 */
export function Segment<T extends string>({
  options,
  value,
  onChange,
  compact = false,
}: {
  options: readonly (readonly [T, string])[];
  value: T;
  onChange: (v: T) => void;
  compact?: boolean;
}) {
  return (
    <View style={styles.seg}>
      {options.map(([v, label]) => (
        <Pressable
          key={v}
          style={[styles.segBtn, value === v && styles.segOn]}
          onPress={() => onChange(v)}
          accessibilityRole="button"
          accessibilityState={{ selected: value === v }}
        >
          <Text
            style={[
              styles.segText,
              compact && styles.segTextCompact,
              value === v && styles.segTextOn,
            ]}
            numberOfLines={1}
          >
            {label}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  seg: { flexDirection: "row", gap: 5, flex: 1 },
  segBtn: {
    flex: 1,
    paddingVertical: 9,
    paddingHorizontal: 4,
    alignItems: "center",
    borderRadius: radius.base,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
    backgroundColor: colors.chrome2,
  },
  segOn: { backgroundColor: colors.accentSoft, borderColor: colors.accent },
  segText: { color: colors.w70, fontWeight: "800", fontSize: 12.5 },
  segTextCompact: { fontSize: 10.5 },
  segTextOn: { color: colors.accent },
});
