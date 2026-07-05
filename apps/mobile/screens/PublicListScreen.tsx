import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { authorLabel } from "@rigel/ui";
import { FlatList, StyleSheet, Text, View } from "react-native";
import { AppBar } from "../components/AppBar";
import { CenterState } from "../components/CenterState";
import { KifuCard } from "../components/KifuCard";
import { Toolbar } from "../components/Toolbar";
import { relativeTime } from "../lib/format";
import type { RootStackParamList } from "../lib/navigation";
import { colors } from "../lib/theme";
import { usePublicGames } from "../lib/use-kifu-data";

type Nav = NativeStackNavigationProp<RootStackParamList, "Home">;

/** 公開牌譜フィード（全ユーザーの公開半荘・新着順、認証不要）。 */
export function PublicListScreen() {
  const nav = useNavigation<Nav>();
  const { loading, games, sample } = usePublicGames();

  return (
    <View style={styles.root}>
      <AppBar title="公開牌譜" />
      <Toolbar sort="新着" segments={["新着", "人気", "今週"]} />
      {loading ? (
        <CenterState loading />
      ) : games.length === 0 ? (
        <CenterState message="まだ公開牌譜がありません。" />
      ) : (
        <FlatList
          data={games}
          keyExtractor={(g) => g.id}
          contentContainerStyle={styles.feed}
          ListHeaderComponent={
            sample ? (
              <Text style={styles.sample}>サンプル表示中（接続後に実データが出ます）</Text>
            ) : null
          }
          renderItem={({ item }) => {
            const author = authorLabel({ handle: item.ownerHandle, name: item.ownerName });
            return (
              <KifuCard
                title={item.title || "（無題の半荘）"}
                badges={[{ label: author, tone: "accent" }]}
                metaParts={[relativeTime(item.createdAt), `${item.kyokuCount}局`]}
                onPress={() =>
                  nav.navigate("PublicGame", { gameId: item.id, logId: item.firstLogId })
                }
              />
            );
          }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  sample: { color: colors.accent, fontSize: 12, paddingBottom: 8 },
  feed: { paddingHorizontal: 16, paddingTop: 2, paddingBottom: 20, gap: 10 },
});
