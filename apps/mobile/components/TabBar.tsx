import { Pressable, StyleSheet, Text, View } from "react-native";
import Svg, { Circle, Path } from "react-native-svg";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors } from "../lib/theme";

export type MainTab = "pub" | "mine" | "set";

function Icon({ name, color }: { name: MainTab | "create"; color: string }) {
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
      {name === "mine" && (
        <>
          <Path d="M4 6h16v12H4z" {...p} />
          <Path d="M4 10h16" {...p} />
        </>
      )}
      {name === "create" && (
        <>
          <Circle cx={12} cy={12} r={9} {...p} />
          <Path d="M12 8.2v7.6M8.2 12h7.6" {...p} />
        </>
      )}
      {name === "set" && (
        <>
          <Circle cx={12} cy={8} r={3.4} {...p} />
          <Path d="M5 20c1.2-3.6 12.8-3.6 14 0" {...p} />
        </>
      )}
    </Svg>
  );
}

const TABS: { key: MainTab; label: string }[] = [
  { key: "pub", label: "公開" },
  { key: "mine", label: "マイ牌譜" },
  { key: "set", label: "設定" },
];

/** 自前のボトムタブ（公開 / マイ牌譜 / 作成 / 設定）。作成は撮影フローへ。 */
export function TabBar({
  active,
  onSelect,
  onCreate,
}: {
  active: MainTab;
  onSelect: (tab: MainTab) => void;
  onCreate: () => void;
}) {
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.bar, { paddingBottom: Math.max(insets.bottom, 10) }]}>
      <TabButton
        tab={TABS[0]}
        active={active === TABS[0].key}
        onPress={() => onSelect(TABS[0].key)}
      />
      <TabButton
        tab={TABS[1]}
        active={active === TABS[1].key}
        onPress={() => onSelect(TABS[1].key)}
      />
      <Pressable
        style={styles.tab}
        onPress={onCreate}
        accessibilityRole="button"
        accessibilityLabel="撮影して作成"
      >
        <Icon name="create" color={colors.w45} />
        <Text style={styles.label}>作成</Text>
      </Pressable>
      <TabButton
        tab={TABS[2]}
        active={active === TABS[2].key}
        onPress={() => onSelect(TABS[2].key)}
      />
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
    <Pressable style={styles.tab} onPress={onPress} accessibilityRole="button">
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
