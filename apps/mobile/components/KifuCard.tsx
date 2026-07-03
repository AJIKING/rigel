import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import Svg, { Path } from "react-native-svg";
import { colors, radius } from "../lib/theme";
import { TileChip } from "./TileChip";

export interface CardBadge {
  label: string;
  /** accent=オレンジ(公開/著者), muted=灰(非公開)。 */
  tone: "accent" | "muted";
}

function StarButton({ initial }: { initial: boolean }) {
  // お気に入りは現状 API 非対応のため、見た目のみのローカルトグル。
  const [on, setOn] = useState(initial);
  return (
    <Pressable
      style={styles.star}
      hitSlop={8}
      accessibilityRole="button"
      accessibilityLabel="お気に入り"
      onPress={() => setOn((v) => !v)}
    >
      <Svg width={18} height={18} viewBox="0 0 24 24" fill={on ? colors.accent : "none"}>
        <Path
          d="M12 2.6l2.85 6.02 6.6.62-4.97 4.4 1.46 6.46L12 17.7 6.06 20.7l1.46-6.46-4.97-4.4 6.6-.62z"
          stroke={on ? colors.accent : colors.w45}
          strokeWidth={1.8}
          strokeLinejoin="round"
        />
      </Svg>
    </Pressable>
  );
}

/** 牌譜一覧のカード（サムネイル + タイトル + メタ + お気に入り）。 */
export function KifuCard({
  title,
  badge,
  metaParts,
  fav = false,
  onPress,
}: {
  title: string;
  badge?: CardBadge;
  /** バッジ以降のメタ（例: ["3分前","8局"]）。 */
  metaParts: string[];
  fav?: boolean;
  onPress?: () => void;
}) {
  return (
    <Pressable style={styles.card} onPress={onPress}>
      <TileChip size={64} center="dot" />
      <View style={styles.main}>
        <Text style={styles.title} numberOfLines={2}>
          {title}
        </Text>
        <View style={styles.meta}>
          {badge ? (
            <>
              <Text style={badge.tone === "accent" ? styles.badgeAccent : styles.badgeMuted}>
                {badge.label}
              </Text>
              <View style={styles.dotsep} />
            </>
          ) : null}
          {metaParts.map((p, i) => (
            <View key={p + i} style={styles.metaItem}>
              {i > 0 ? <View style={styles.dotsep} /> : null}
              <Text style={styles.metaText}>{p}</Text>
            </View>
          ))}
        </View>
      </View>
      <StarButton initial={fav} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: "row",
    gap: 12,
    padding: 11,
    backgroundColor: colors.chrome,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
    borderRadius: radius.card,
  },
  main: { flex: 1, minWidth: 0, paddingRight: 24 },
  title: { color: colors.white, fontSize: 14, fontWeight: "700", lineHeight: 20, marginBottom: 5 },
  meta: { flexDirection: "row", alignItems: "center", flexWrap: "wrap" },
  metaItem: { flexDirection: "row", alignItems: "center" },
  metaText: { color: colors.w45, fontSize: 11.5 },
  badgeAccent: { color: colors.accent, fontSize: 11.5, fontWeight: "700" },
  badgeMuted: { color: colors.w45, fontSize: 11.5 },
  dotsep: {
    width: 3,
    height: 3,
    borderRadius: 1.5,
    backgroundColor: colors.w45,
    marginHorizontal: 6,
  },
  star: {
    position: "absolute",
    top: 9,
    right: 9,
    width: 30,
    height: 30,
    alignItems: "center",
    justifyContent: "center",
  },
});
