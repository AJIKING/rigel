import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from "react-native";
import { fmtDate } from "../lib/format";
import type { RootStackParamList } from "../lib/navigation";
import { useGames } from "../lib/use-kifu-data";

type Nav = NativeStackNavigationProp<RootStackParamList, "GamesList">;

export function GamesListScreen() {
  const nav = useNavigation<Nav>();
  const { loading, games, sample, error } = useGames();

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator />
      </View>
    );
  }
  if (error) {
    return (
      <View style={styles.center}>
        <Text style={styles.error}>{error}</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {sample && <Text style={styles.sample}>サンプル表示中（ログインで自分の半荘が出ます）</Text>}
      {games.length === 0 ? (
        <Text style={styles.empty}>まだ半荘がありません。卓を撮影して記録してください。</Text>
      ) : (
        <FlatList
          data={games}
          keyExtractor={(g) => g.id}
          contentContainerStyle={{ gap: 10, padding: 12 }}
          renderItem={({ item }) => (
            <Pressable
              style={styles.card}
              onPress={() => nav.navigate("GameDetail", { gameId: item.id })}
            >
              <Text style={styles.title}>{item.title || "（無題の半荘）"}</Text>
              <Text style={styles.date}>{fmtDate(item.createdAt)}</Text>
            </Pressable>
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  sample: { color: "#a60", fontSize: 12, padding: 12, paddingBottom: 0 },
  empty: { color: "#888", padding: 16 },
  error: { color: "crimson" },
  card: { borderWidth: 1, borderColor: "#eee", borderRadius: 10, padding: 14 },
  title: { fontWeight: "700", fontSize: 15 },
  date: { color: "#999", fontSize: 12, marginTop: 2 },
});
