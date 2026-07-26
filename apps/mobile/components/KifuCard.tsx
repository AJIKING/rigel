import { Pressable, StyleSheet, Text, View } from "react-native";
import { colors, radius } from "../lib/theme";
import { StarButton } from "./StarButton";
import { TileChip } from "./TileChip";

export interface CardBadge {
  label: string;
  /** accent=オレンジ(公開/著者), muted=灰(非公開/編集済), warn=朱(下書きあり)。 */
  tone: "accent" | "muted" | "warn";
}

const BADGE_STYLE: Record<CardBadge["tone"], object> = {
  accent: { color: colors.accent, fontSize: 11.5, fontWeight: "700" },
  muted: { color: colors.w45, fontSize: 11.5 },
  warn: { color: colors.vermilion, fontSize: 11.5, fontWeight: "700" },
};

/** 牌譜一覧のカード（サムネイル + タイトル + バッジ列 + メタ + お気に入り）。 */
export function KifuCard({
  title,
  badges = [],
  metaParts,
  fav = false,
  favCount = 0,
  onToggleFav,
  onPress,
  onLongPress,
}: {
  title: string;
  /** 先頭に並べるバッジ（例: 公開/非公開、下書きN/編集済）。 */
  badges?: CardBadge[];
  /** バッジ以降のメタ（例: ["3分前","8局"]）。 */
  metaParts: string[];
  fav?: boolean;
  /** お気に入り数（サーバー集計）。0 なら数字を出さない。 */
  favCount?: number;
  /** 星の押下（お気に入りの追加/解除）。未指定なら星を出さない（偽トグルにしない）。 */
  onToggleFav?: () => void;
  onPress?: () => void;
  /** 長押し（例: 削除メニュー）。 */
  onLongPress?: () => void;
}) {
  return (
    <Pressable style={styles.card} onPress={onPress} onLongPress={onLongPress} delayLongPress={350}>
      <TileChip size={64} center="dot" />
      <View style={styles.main}>
        <Text style={styles.title} numberOfLines={2}>
          {title}
        </Text>
        <View style={styles.meta}>
          {badges.map((b) => (
            <View key={b.label} style={styles.metaItem}>
              <Text style={BADGE_STYLE[b.tone]}>{b.label}</Text>
              <View style={styles.dotsep} />
            </View>
          ))}
          {metaParts.map((p, i) => (
            <View key={p + i} style={styles.metaItem}>
              {i > 0 ? <View style={styles.dotsep} /> : null}
              <Text style={styles.metaText}>{p}</Text>
            </View>
          ))}
        </View>
      </View>
      {onToggleFav ? (
        <View style={styles.star}>
          <StarButton on={fav} count={favCount} onPress={onToggleFav} />
        </View>
      ) : null}
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
  dotsep: {
    width: 3,
    height: 3,
    borderRadius: 1.5,
    backgroundColor: colors.w45,
    marginHorizontal: 6,
  },
  star: { position: "absolute", top: 9, right: 9 },
});
