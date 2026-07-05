import { useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import Svg, { Circle, Path } from "react-native-svg";
import { colors, radius } from "../lib/theme";

function SearchIcon() {
  return (
    <Svg width={16} height={16} viewBox="0 0 24 24" fill="none">
      <Circle cx={11} cy={11} r={7} stroke={colors.w45} strokeWidth={2} />
      <Path d="M20 20l-3.5-3.5" stroke={colors.w45} strokeWidth={2} strokeLinecap="round" />
    </Svg>
  );
}

/**
 * 一覧の操作バー（検索・並べ替え・セグメント）。
 * 見た目の配置のみ（セグメントはタップ選択できるが絞り込みは未配線）。
 */
export function Toolbar({ segments }: { segments?: string[] }) {
  const [active, setActive] = useState(0);
  return (
    <View>
      <View style={styles.tools}>
        <View style={styles.search}>
          <SearchIcon />
          <TextInput
            style={styles.input}
            placeholder="牌譜を検索"
            placeholderTextColor={colors.w45}
          />
        </View>
      </View>
      {segments && segments.length > 0 ? (
        <View style={styles.segrow}>
          {segments.map((s, i) => {
            const on = i === active;
            return (
              <Pressable
                key={s}
                onPress={() => setActive(i)}
                style={[styles.seg, on && styles.segOn]}
              >
                <Text style={[styles.segText, on && styles.segTextOn]}>{s}</Text>
              </Pressable>
            );
          })}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  tools: { flexDirection: "row", gap: 8, paddingHorizontal: 16, paddingTop: 12, paddingBottom: 8 },
  search: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: colors.chrome2,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
    borderRadius: radius.base,
    paddingHorizontal: 11,
    paddingVertical: 9,
  },
  input: { flex: 1, color: colors.white, fontSize: 13, padding: 0 },
  segrow: { flexDirection: "row", gap: 7, paddingHorizontal: 16, paddingBottom: 12 },
  seg: {
    backgroundColor: colors.chrome2,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
    borderRadius: radius.base,
    paddingHorizontal: 13,
    paddingVertical: 7,
  },
  segOn: { backgroundColor: colors.accentSoft, borderColor: colors.accent },
  segText: { color: colors.w70, fontWeight: "700", fontSize: 12.5 },
  segTextOn: { color: colors.accent },
});
