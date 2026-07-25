import { Pressable, StyleSheet, Text, View } from "react-native";
import Svg, { Circle, Path } from "react-native-svg";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors } from "../lib/theme";

export type MainTab = "pub" | "problems" | "training" | "my" | "set";

function Icon({ name, color }: { name: MainTab; color: string }) {
  const p = {
    stroke: color,
    strokeWidth: 1.8,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    fill: "none" as const,
  };
  return (
    <Svg width={23} height={23} viewBox="0 0 24 24">
      {name === "pub" && (
        <>
          <Circle cx={12} cy={12} r={9} {...p} />
          <Path d="M3 12h18M12 3c3 3 3 15 0 18M12 3c-3 3-3 15 0 18" {...p} />
        </>
      )}
      {name === "problems" && (
        <>
          {/* 牌（縦長の角丸タイル＋中央の目）。何切る＝牌の選択のメタファ。 */}
          <Path d="M8 3.5h8a2 2 0 012 2v13a2 2 0 01-2 2H8a2 2 0 01-2-2v-13a2 2 0 012-2z" {...p} />
          <Circle cx={12} cy={12} r={2.4} {...p} />
        </>
      )}
      {name === "training" && (
        <>
          {/* ストップウォッチ（60秒タイムアタックのメタファ）。 */}
          <Circle cx={12} cy={13.5} r={7} {...p} />
          <Path d="M10 2.5h4M12 2.5v2M12 13.5V9.5M16.8 8.2l1.4-1.4" {...p} />
        </>
      )}
      {name === "my" && (
        <>
          <Circle cx={12} cy={8} r={3.4} {...p} />
          <Path d="M5 20c1.2-3.6 12.8-3.6 14 0" {...p} />
        </>
      )}
      {name === "set" && (
        <>
          {/* 歯車（中心円＋8方向の歯）。 */}
          <Circle cx={12} cy={12} r={3.2} {...p} />
          <Path
            d="M12 3v2.6M12 18.4V21M3 12h2.6M18.4 12H21M5.6 5.6l1.9 1.9M16.5 16.5l1.9 1.9M18.4 5.6l-1.9 1.9M7.5 16.5l-1.9 1.9"
            {...p}
          />
        </>
      )}
    </Svg>
  );
}

const TABS: { key: MainTab; label: string }[] = [
  { key: "pub", label: "牌譜" },
  { key: "problems", label: "何切る" },
  { key: "training", label: "特訓" },
  { key: "my", label: "マイページ" },
  { key: "set", label: "設定" },
];

/** 自前のボトムタブ（牌譜 / 何切る / 特訓 / マイページ / 設定）。作成導線はマイページ内の「＋ 新規」。
 *  並びは web ヘッダ（牌譜・何切る・特訓・マイページ）と揃える。 */
export function TabBar({
  active,
  onSelect,
}: {
  active: MainTab;
  onSelect: (tab: MainTab) => void;
}) {
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.bar, { paddingBottom: Math.max(insets.bottom, 10) }]}>
      {TABS.map((tab) => (
        <TabButton
          key={tab.key}
          tab={tab}
          active={active === tab.key}
          onPress={() => onSelect(tab.key)}
        />
      ))}
    </View>
  );
}

function TabButton({
  tab,
  active,
  onPress,
}: {
  tab: { key: MainTab; label: string };
  active: boolean;
  onPress: () => void;
}) {
  const color = active ? colors.accent : colors.w45;
  return (
    <Pressable
      style={styles.tab}
      onPress={onPress}
      accessibilityRole="button"
      // 選択中タブをスクリーンリーダーに伝える（Segment/Chip と同じ流儀）。
      accessibilityState={{ selected: active }}
    >
      <Icon name={tab.key} color={color} />
      <Text style={[styles.label, { color }]}>{tab.label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: "row",
    justifyContent: "space-around",
    alignItems: "flex-start",
    paddingTop: 9,
    backgroundColor: colors.chrome,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.line,
  },
  tab: { alignItems: "center", gap: 3, minWidth: 52, paddingTop: 2 },
  label: { color: colors.w45, fontSize: 10, fontWeight: "700" },
});
