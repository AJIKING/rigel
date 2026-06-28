import { useRoute, type RouteProp } from "@react-navigation/native";
import { collectReviewItems } from "@rigel/ui";
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from "react-native";
import { KifuBoardView } from "../components/KifuBoardView";
import { fmtDate } from "../lib/format";
import type { RootStackParamList } from "../lib/navigation";
import { useGame } from "../lib/use-kifu-data";

export function BoardScreen() {
  const { gameId, logId } = useRoute<RouteProp<RootStackParamList, "Board">>().params;
  const { loading, detail } = useGame(gameId);
  const log = detail?.logs.find((l) => l.id === logId);

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator />
      </View>
    );
  }
  if (!log) {
    return (
      <View style={styles.center}>
        <Text style={styles.empty}>牌譜が見つかりませんでした。</Text>
      </View>
    );
  }

  const reviews = collectReviewItems(log.kifu).length;

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>第 {log.seq} 局</Text>
      <Text style={styles.meta}>
        撮影: {fmtDate(log.kifu.capturedAt)}
        {reviews > 0 ? ` ／ 要確認 ${reviews}（赤枠）` : " ／ 確認済"}
      </Text>
      <KifuBoardView kifu={log.kifu} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 12, gap: 6 },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  empty: { color: "#888" },
  title: { fontWeight: "700", fontSize: 16 },
  meta: { color: "#888", fontSize: 12, marginBottom: 6 },
});
