import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { FlatList, StyleSheet, Text, View } from "react-native";
import { AppBar } from "../components/AppBar";
import { CenterState } from "../components/CenterState";
import { KifuCard } from "../components/KifuCard";
import { Toolbar } from "../components/Toolbar";
import { relativeTime } from "../lib/format";
import type { RootStackParamList } from "../lib/navigation";
import { colors } from "../lib/theme";
import { useMyGames } from "../lib/use-kifu-data";

type Nav = NativeStackNavigationProp<RootStackParamList, "Home">;

/** マイ牌譜（自分の半荘一覧）。公開/非公開バッジ付き。 */
export function MyListScreen() {
  const nav = useNavigation<Nav>();
  const { loading, games, sample } = useMyGames();

  return (
    <View style={styles.root}>
      <AppBar title="マイ牌譜" />
      <Toolbar sort="新着" />
      {loading ? (
        <CenterState loading />
      ) : games.length === 0 ? (
        <CenterState message="まだ半荘がありません。卓を撮影して記録してください。" />
      ) : (
        <FlatList
          data={games}
          keyExtractor={(g) => g.id}
          contentContainerStyle={styles.feed}
          ListHeaderComponent={
            sample ? (
              <Text style={styles.sample}>サンプル表示中（ログインで自分の半荘が出ます）</Text>
            ) : null
          }
          renderItem={({ item }) => (
            <KifuCard
              title={item.title || "（無題の半荘）"}
              badge={
                item.publicCount > 0
                  ? { label: "公開", tone: "accent" }
                  : { label: "非公開", tone: "muted" }
              }
              metaParts={[relativeTime(item.createdAt), `${item.kyokuCount}局`]}
              onPress={() => nav.navigate("GameDetail", { gameId: item.id })}
            />
          )}
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
