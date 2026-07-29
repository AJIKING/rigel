import { useFocusEffect, useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { planKifuLimits, sortMyList, type MyListSortKey } from "@rigel/ui";
import { useCallback, useMemo, useState } from "react";
import { FlatList, Pressable, StyleSheet, Text, View } from "react-native";
import { CenterState } from "../components/CenterState";
import { KifuCard } from "../components/KifuCard";
import { MyListToolbar } from "../components/MyListToolbar";
import { Toolbar } from "../components/Toolbar";
import { deleteGame } from "../lib/api";
import { useAuth } from "../lib/auth";
import { confirmDestructive } from "../lib/confirm";
import { relativeTime } from "../lib/format";
import type { RootStackParamList } from "../lib/navigation";
import { colors, radius } from "../lib/theme";
import { useFavorites } from "../lib/use-favorites";
import { useMyGames } from "../lib/use-kifu-data";

type Nav = NativeStackNavigationProp<RootStackParamList, "Home">;

/** マイ牌譜（自分の半荘一覧。マイページの牌譜セグメントとして表示）。公開/非公開バッジ付き。 */
export function MyListScreen() {
  const nav = useNavigation<Nav>();
  const { user, token } = useAuth();
  const { loading, games, sample, error, refetch } = useMyGames();
  // お気に入りはサーバー保存。カードの値に、この画面での操作を重ねる（web のマイページと対）。
  const { apply, toggle: toggleFav, error: favError } = useFavorites();
  const [sort, setSort] = useState<MyListSortKey>("new");
  const [favOnly, setFavOnly] = useState(false);

  const shown = useMemo(() => {
    const resolved = apply(games);
    return sortMyList(favOnly ? resolved.filter((g) => g.viewerFaved) : resolved, sort);
  }, [games, apply, favOnly, sort]);

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

  // 作成可能数と現在数。上限は「半荘」単位（非公開complete・下書きは別枠。free=各5 / 有料=無制限）。
  const limits = planKifuLimits(user?.plan ?? "free");
  const draftUsed = games.filter((g) => g.draftCount > 0).length;
  const privateUsed = games.filter((g) => g.kyokuCount - g.publicCount - g.draftCount > 0).length;
  const quota = (used: number, limit: number | null) =>
    limit === null ? `${used}（無制限）` : `${used} / ${limit}半荘`;
  // 上限に達したら警告色（これ以上は作成/保存できないため）。
  const atLimit = (used: number, limit: number | null) => limit !== null && used >= limit;

  return (
    <View style={styles.root}>
      <Toolbar />
      {/* ＋新規はツールバー右端の action スロットへ（タブ間で位置を統一。[決定] 2026-07-29）。
          クォータはツールバー直下の行に出す。 */}
      <MyListToolbar
        sort={sort}
        onSort={setSort}
        favOnly={favOnly}
        onFavOnly={setFavOnly}
        // 作成にはサインインが必要なので、ゲスト（サンプル表示）では新規ボタンを出さない。
        action={
          token ? (
            <Pressable
              style={styles.newBtn}
              onPress={() => nav.navigate("Capture")}
              accessibilityRole="button"
            >
              <Text style={styles.newBtnText}>＋ 新規</Text>
            </Pressable>
          ) : undefined
        }
      />
      {favError ? <Text style={styles.favError}>{favError}</Text> : null}
      {!loading && (
        <View style={styles.head}>
          {sample ? (
            <Text style={styles.sample}>サンプル表示中（サインインで自分の半荘が出ます）</Text>
          ) : (
            <View style={styles.quota}>
              <Text
                style={[styles.quotaText, atLimit(privateUsed, limits.private) && styles.quotaWarn]}
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
      )}
      {loading ? (
        <CenterState loading />
      ) : shown.length === 0 ? (
        <CenterState
          message={
            // 取得失敗を「0件」に化けさせない（空状態の案内より失敗の理由を優先する）。
            error ??
            (favOnly
              ? "お気に入りした半荘はまだありません。"
              : "まだ半荘がありません。「＋ 新規」から撮影、または手入力で記録できます。")
          }
        />
      ) : (
        <FlatList
          data={shown}
          keyExtractor={(g) => g.id}
          contentContainerStyle={styles.feed}
          renderItem={({ item }) => (
            <KifuCard
              title={item.title || "（無題の半荘）"}
              badges={[
                item.publicCount > 0
                  ? { label: "公開", tone: "accent" }
                  : { label: "非公開", tone: "muted" },
                // 下書きが1局でもあれば注意色で示し（件数は出さない）、無ければ編集済。
                item.draftCount > 0
                  ? { label: "下書き", tone: "warn" }
                  : { label: "編集済", tone: "muted" },
              ]}
              metaParts={[relativeTime(item.createdAt), `${item.kyokuCount}局`]}
              fav={item.viewerFaved}
              favCount={item.favoriteCount}
              onToggleFav={sample ? undefined : () => toggleFav("game", item)}
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
  head: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
    paddingHorizontal: 16,
    paddingBottom: 8,
  },
  sample: { color: colors.accent, fontSize: 12, flexShrink: 1 },
  favError: { color: colors.danger, fontSize: 12, paddingHorizontal: 16, paddingTop: 8 },
  feed: { paddingHorizontal: 16, paddingTop: 2, paddingBottom: 20, gap: 10 },
  quota: { flexDirection: "row", alignItems: "center", gap: 6 },
  quotaText: { color: colors.w70, fontSize: 12, fontWeight: "700" },
  quotaWarn: { color: colors.vermilion },
  quotaDot: { color: colors.w45, fontSize: 12 },
  newBtn: {
    backgroundColor: colors.accent,
    borderRadius: radius.base,
    paddingVertical: 8,
    paddingHorizontal: 14,
  },
  newBtnText: { color: "#16181d", fontWeight: "800", fontSize: 13 },
});
