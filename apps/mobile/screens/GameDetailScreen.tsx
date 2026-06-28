import { useNavigation, useRoute, type RouteProp } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { collectReviewItems } from "@rigel/ui";
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from "react-native";
import { fmtDate } from "../lib/format";
import type { RootStackParamList } from "../lib/navigation";
import { useGame } from "../lib/use-kifu-data";

type Nav = NativeStackNavigationProp<RootStackParamList, "GameDetail">;

export function GameDetailScreen() {
  const nav = useNavigation<Nav>();
  const { gameId } = useRoute<RouteProp<RootStackParamList, "GameDetail">>().params;
  const { loading, detail } = useGame(gameId);

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator />
      </View>
    );
  }
  if (!detail) {
    return (
      <View style={styles.center}>
        <Text style={styles.empty}>半荘が見つかりませんでした。</Text>
      </View>
    );
  }

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
              {reviews > 0 ? (
                <Text style={styles.review}>要確認 {reviews}</Text>
              ) : (
                <Text style={styles.done}>確認済</Text>
              )}
            </Pressable>
          );
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  head: { padding: 12, paddingBottom: 0 },
  title: { fontWeight: "700", fontSize: 16 },
  date: { color: "#999", fontSize: 12, marginTop: 2 },
  empty: { color: "#888" },
  card: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#eee",
    borderRadius: 8,
    padding: 12,
  },
  localTitle: { fontWeight: "700" },
  result: { color: "#999", fontWeight: "400", fontSize: 13 },
  review: { color: "#d10f3a", fontSize: 12 },
  done: { color: "#1b7a2f", fontSize: 12 },
});
