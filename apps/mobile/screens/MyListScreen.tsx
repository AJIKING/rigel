import { useFocusEffect, useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { planKifuLimits } from "@rigel/ui";
import { useCallback } from "react";
import { FlatList, StyleSheet, Text, View } from "react-native";
import { AppBar } from "../components/AppBar";
import { CenterState } from "../components/CenterState";
import { KifuCard } from "../components/KifuCard";
import { Toolbar } from "../components/Toolbar";
import { deleteGame } from "../lib/api";
import { useAuth } from "../lib/auth";
import { confirmDestructive } from "../lib/confirm";
import { relativeTime } from "../lib/format";
import type { RootStackParamList } from "../lib/navigation";
import { colors } from "../lib/theme";
import { useMyGames } from "../lib/use-kifu-data";

type Nav = NativeStackNavigationProp<RootStackParamList, "Home">;

/** マイ牌譜（自分の半荘一覧）。公開/非公開バッジ付き。 */
export function MyListScreen() {
  const nav = useNavigation<Nav>();
  const { user, token } = useAuth();
  const { loading, games, sample, refetch } = useMyGames();

  // 撮影・編集から戻ったとき一覧を最新化する（静かに再取得）。
  useFocusEffect(
    useCallback(() => {
      refetch();
    }, [refetch]),
  );

  /** 半荘を長押しで削除（確認つき。成功で一覧を再取得）。 */
  function onDelete(gameId: string, title: string) {
    if (!token || sample) return;
    confirmDestructive({
      title: `「${title || "無題の半荘"}」を削除しますか？`,
      message: "配下のすべての局が削除され、元に戻せません。",
      onConfirm: () => {
        deleteGame(token, gameId)
          .then((res) => res.ok && refetch())
          .catch(() => {});
      },
    });
  }

  // 作成可能件数と現在の件数（非公開complete・下書きは別枠。free=各5 / 有料=無制限）。
  const limits = planKifuLimits(user?.plan ?? "free");
  const draftUsed = games.reduce((n, g) => n + g.draftCount, 0);
  const privateUsed = games.reduce((n, g) => n + (g.kyokuCount - g.publicCount - g.draftCount), 0);
  const quota = (used: number, limit: number | null) =>
    limit === null ? `${used}件（無制限）` : `${used} / ${limit}件`;
  // 上限に達したら警告色（これ以上は作成/保存できないため）。
  const atLimit = (used: number, limit: number | null) => limit !== null && used >= limit;

  return (
    <View style={styles.root}>
      <AppBar title="マイ牌譜" />
      <Toolbar sort="新着" />
      {loading ? (
        <CenterState loading />
      ) : games.length === 0 ? (
        <CenterState message="まだ半荘がありません。作成タブから撮影、または手入力で記録できます。" />
      ) : (
        <FlatList
          data={games}
          keyExtractor={(g) => g.id}
          contentContainerStyle={styles.feed}
          ListHeaderComponent={
            <View>
              {sample ? (
                <Text style={styles.sample}>サンプル表示中（ログインで自分の半荘が出ます）</Text>
              ) : (
                <View style={styles.quota}>
                  <Text
                    style={[
                      styles.quotaText,
                      atLimit(privateUsed, limits.private) && styles.quotaWarn,
                    ]}
                  >
                    非公開 {quota(privateUsed, limits.private)}
                  </Text>
                  <Text style={styles.quotaDot}>・</Text>
                  <Text
                    style={[styles.quotaText, atLimit(draftUsed, limits.draft) && styles.quotaWarn]}
                  >
                    下書き {quota(draftUsed, limits.draft)}
                  </Text>
                </View>
              )}
            </View>
          }
          renderItem={({ item }) => (
            <KifuCard
              title={item.title || "（無題の半荘）"}
              badges={[
                item.publicCount > 0
                  ? { label: "公開", tone: "accent" }
                  : { label: "非公開", tone: "muted" },
                // 下書きが1局でもあれば注意色で示し、無ければ編集済。
                item.draftCount > 0
                  ? { label: `下書き${item.draftCount}`, tone: "warn" }
                  : { label: "編集済", tone: "muted" },
              ]}
              metaParts={[relativeTime(item.createdAt), `${item.kyokuCount}局`]}
              onPress={() => nav.navigate("GameDetail", { gameId: item.id })}
              onLongPress={sample ? undefined : () => onDelete(item.id, item.title)}
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
  quota: { flexDirection: "row", alignItems: "center", gap: 6, paddingBottom: 8 },
  quotaText: { color: colors.w70, fontSize: 12, fontWeight: "700" },
  quotaWarn: { color: colors.vermilion },
  quotaDot: { color: colors.w45, fontSize: 12 },
});
