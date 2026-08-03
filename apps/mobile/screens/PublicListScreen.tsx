import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { authorLabel, filterPublicFeed, PUBLIC_FEED_FILTERS } from "@rigel/ui";
import { useMemo, useState } from "react";
import { FlatList, StyleSheet, Text, View } from "react-native";
import { AppBar } from "../components/AppBar";
import { CenterState } from "../components/CenterState";
import { KifuCard } from "../components/KifuCard";
import { Toolbar } from "../components/Toolbar";
import { relativeTime } from "../lib/format";
import type { RootStackParamList } from "../lib/navigation";
import { colors } from "../lib/theme";
import { useFavorites } from "../lib/use-favorites";
import { usePublicGames } from "../lib/use-kifu-data";

type Nav = NativeStackNavigationProp<RootStackParamList, "Home">;

// セグメントの表示ラベル（選択肢と意味は @rigel/ui で web と共通定義）。
const SEGMENT_LABELS = PUBLIC_FEED_FILTERS.map((f) => f.label);

/** 公開牌譜フィード（全ユーザーの公開半荘・新着順、認証不要）。 */
export function PublicListScreen() {
  const nav = useNavigation<Nav>();
  const { loading, games, sample, error } = usePublicGames();
  // お気に入りはサーバー保存。カードの値に、この画面での操作を重ねる。
  const { apply, toggle: toggleFav } = useFavorites();
  const [filter, setFilter] = useState(0);
  const [q, setQ] = useState("");
  const filterKey = PUBLIC_FEED_FILTERS[filter]!.key;

  // 検索対象はタイトル・投稿者（web の公開一覧と同じ条件）。
  const shown = useMemo(() => {
    let arr = apply(games);
    if (q) {
      arr = arr.filter(
        (c) =>
          c.title.includes(q) ||
          (c.ownerHandle ?? "").includes(q) ||
          (c.ownerName ?? "").includes(q),
      );
    }
    return filterPublicFeed(arr, filterKey);
  }, [games, filterKey, q, apply]);

  return (
    <View style={styles.root}>
      <AppBar title="公開牌譜" />
      <Toolbar
        segments={SEGMENT_LABELS}
        activeIndex={filter}
        onSegmentPress={setFilter}
        search={{ value: q, onChange: setQ, placeholder: "牌譜を検索" }}
      />
      {loading ? (
        <CenterState loading />
      ) : shown.length === 0 ? (
        <CenterState
          message={
            // 取得失敗を「0件」に化けさせない（空状態の案内より失敗の理由を優先する）。
            error ??
            (filterKey === "fav"
              ? "お気に入りした牌譜がまだありません。"
              : "まだ公開牌譜がありません。")
          }
        />
      ) : (
        <FlatList
          data={shown}
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
                fav={item.viewerFaved}
                favCount={item.favoriteCount}
                onToggleFav={() => toggleFav("game", item)}
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
