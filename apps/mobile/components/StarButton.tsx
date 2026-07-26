import { Pressable, StyleSheet, Text } from "react-native";
import Svg, { Path } from "react-native-svg";
import { colors } from "../lib/theme";

/**
 * お気に入り（★）ボタン。牌譜カード（KifuCard）とマイ何切るのカードで共用する。
 * 件数は1件以上のときだけ添える（0 を並べても情報にならない）。件数はサーバー集計で、
 * 「お気に入りが多い順」の並べ替えの根拠でもあるので読み上げ名にも入れる。
 */
export function StarButton({
  on,
  count = 0,
  onPress,
}: {
  on: boolean;
  count?: number;
  onPress: () => void;
}) {
  return (
    <Pressable
      style={styles.star}
      hitSlop={8}
      accessibilityRole="button"
      accessibilityState={{ selected: on }}
      accessibilityLabel={
        count > 0 ? `お気に入りに追加/解除（${count}件）` : "お気に入りに追加/解除"
      }
      onPress={onPress}
    >
      <Svg width={18} height={18} viewBox="0 0 24 24" fill={on ? colors.accent : "none"}>
        <Path
          d="M12 2.6l2.85 6.02 6.6.62-4.97 4.4 1.46 6.46L12 17.7 6.06 20.7l1.46-6.46-4.97-4.4 6.6-.62z"
          stroke={on ? colors.accent : colors.w45}
          strokeWidth={1.8}
          strokeLinejoin="round"
        />
      </Svg>
      {count > 0 ? <Text style={styles.count}>{count}</Text> : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  star: {
    minWidth: 30,
    height: 30,
    flexDirection: "row",
    gap: 4,
    alignItems: "center",
    justifyContent: "center",
  },
  count: { color: colors.w45, fontSize: 11, fontWeight: "800" },
});
