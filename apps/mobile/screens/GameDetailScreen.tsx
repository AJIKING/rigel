import { useNavigation, useRoute, type RouteProp } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { collectReviewItems } from "@rigel/ui";
import { FlatList, Pressable, StyleSheet, Text, View } from "react-native";
import { CenterState } from "../components/CenterState";
import { fmtDate } from "../lib/format";
import { colors } from "../lib/theme";
import type { RootStackParamList } from "../lib/navigation";
import { useGame } from "../lib/use-kifu-data";

type Nav = NativeStackNavigationProp<RootStackParamList, "GameDetail">;

export function GameDetailScreen() {
  const nav = useNavigation<Nav>();
  const { gameId } = useRoute<RouteProp<RootStackParamList, "GameDetail">>().params;
  const { loading, detail } = useGame(gameId);

  if (loading) return <CenterState loading />;
  if (!detail) return <CenterState message="半荘が見つかりませんでした。" />;

  return (
    <View style={styles.container}>
      <View style={styles.head}>
        <Text style={styles.title}>{detail.game.title || "（無題の半荘）"}</Text>
        <Text style={styles.date}>
          {fmtDate(detail.game.createdAt)} ／ {detail.logs.length} 局
        </Text>
      </View>
      <FlatList
        data={detail.logs}
        keyExtractor={(l) => l.id}
        contentContainerStyle={{ gap: 8, padding: 12 }}
        renderItem={({ item }) => {
          const reviews = collectReviewItems(item.kifu).length;
          return (
            <Pressable
              style={styles.card}
              onPress={() => nav.navigate("Board", { gameId, logId: item.id })}
            >
              <Text style={styles.localTitle}>
                第 {item.seq} 局 <Text style={styles.result}>{item.kifu.result ?? "—"}</Text>
              </Text>
              <View style={styles.cardRight}>
                {reviews > 0 ? (
                  <Text style={styles.review}>要確認 {reviews}</Text>
                ) : (
                  <Text style={styles.done}>確認済</Text>
                )}
                <Pressable
                  onPress={() => nav.navigate("Edit", { gameId, logId: item.id })}
                  accessibilityRole="button"
                  accessibilityLabel={`第${item.seq}局を編集`}
                  hitSlop={8}
                >
                  <Text style={styles.edit}>編集 ›</Text>
                </Pressable>
              </View>
            </Pressable>
          );
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  head: { padding: 12, paddingBottom: 0 },
  title: { color: colors.white, fontWeight: "700", fontSize: 16 },
  date: { color: colors.w45, fontSize: 12, marginTop: 2 },
  card: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: colors.chrome,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
    borderRadius: 8,
    padding: 12,
  },
  localTitle: { color: colors.white, fontWeight: "700" },
  result: { color: colors.w45, fontWeight: "400", fontSize: 13 },
  review: { color: colors.vermilion, fontSize: 12 },
  done: { color: colors.emLite, fontSize: 12 },
  cardRight: { flexDirection: "row", alignItems: "center", gap: 14 },
  edit: { color: colors.accent, fontSize: 12.5, fontWeight: "700" },
});
