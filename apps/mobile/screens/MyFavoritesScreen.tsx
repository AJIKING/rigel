import { useFocusEffect, useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import type { FavoriteGameCard, FavoriteProblemCard } from "@rigel/client";
import {
  authorLabel,
  LIST_LOAD_ERROR_MESSAGE,
  sortMyList,
  type FeedCard,
  type MyListSortKey,
} from "@rigel/ui";
import { useCallback, useMemo, useState } from "react";
import { FlatList, StyleSheet, Text, View } from "react-native";
import { CenterState } from "../components/CenterState";
import { KifuCard } from "../components/KifuCard";
import { MyListToolbar } from "../components/MyListToolbar";
import { Segment } from "../components/Segment";
import { listMyFavorites } from "../lib/api";
import { useAuth } from "../lib/auth";
import { relativeTime } from "../lib/format";
import type { RootStackParamList } from "../lib/navigation";
import { KIND_LABELS } from "../lib/problems";
import { colors } from "../lib/theme";
import { useFavorites } from "../lib/use-favorites";

type Nav = NativeStackNavigationProp<RootStackParamList, "Home">;

/** 種別の絞り込み（web のお気に入りタブの「種別で絞り込み」と同じ選択肢）。 */
const KINDS = [
  ["all", "すべて"],
  ["game", "牌譜"],
  ["problem", "何切る"],
] as const;
type KindKey = (typeof KINDS)[number][0];

/** 一覧に並べる1件（牌譜と何切るを1つの FlatList に混ぜるための判別つき共用体）。 */
type Row =
  { kind: "game"; card: FavoriteGameCard } | { kind: "problem"; card: FavoriteProblemCard };

/**
 * マイページ「お気に入り」セグメント。**自分が付けた★を、牌譜と何切るをまたいで1か所で見る**
 * （[決定] 2026-07-26。それまでは他人の投稿に付けた★をどこからも辿れなかった）。
 * 非公開に戻された・削除された対象はサーバー側で落ちるので、ここには出てこない。
 */
export function MyFavoritesScreen() {
  const nav = useNavigation<Nav>();
  const { token } = useAuth();
  const [loading, setLoading] = useState(true);
  const [games, setGames] = useState<FavoriteGameCard[]>([]);
  const [problems, setProblems] = useState<FavoriteProblemCard[]>([]);
  // 取得失敗を「0件」に化けさせない（空状態の案内を出すと通信失敗に気づけない）。
  const [loadFailed, setLoadFailed] = useState(false);
  const { apply, toggle: toggleFav, error: favError } = useFavorites();
  const [kind, setKind] = useState<KindKey>("all");
  const [sort, setSort] = useState<MyListSortKey>("new");

  // 他の画面で付け外しした結果を反映するため、表示のたびに取り直す。
  useFocusEffect(
    useCallback(() => {
      if (!token) {
        setLoading(false);
        return;
      }
      let active = true;
      listMyFavorites(token)
        .then((res) => {
          if (!active) return;
          setGames(res.games);
          setProblems(res.problems);
          setLoadFailed(false);
          setLoading(false);
        })
        .catch(() => {
          // 一覧は前回の内容のまま残す（空配列で塗り潰さない）。
          if (!active) return;
          setLoadFailed(true);
          setLoading(false);
        });
      return () => {
        active = false;
      };
    }, [token]),
  );

  const rows = useMemo<Row[]>(() => {
    // このタブは常に「お気に入りのみ」（★を外したものはその場で消す）。
    // 絞り込みチップは出さない（[決定] 2026-07-29。全部お気に入りなので無意味）。
    const pick = <T extends FeedCard>(cards: T[]): T[] => {
      const resolved = apply(cards);
      return sortMyList(
        resolved.filter((c) => c.viewerFaved),
        sort,
      );
    };
    return [
      ...(kind === "problem" ? [] : pick(games).map((card) => ({ kind: "game" as const, card }))),
      ...(kind === "game"
        ? []
        : pick(problems).map((card) => ({ kind: "problem" as const, card }))),
    ];
  }, [games, problems, kind, sort, apply]);

  if (!token) return <CenterState message="ログインするとお気に入りが使えます。" />;

  return (
    <View style={styles.root}>
      <View style={styles.kindRow}>
        <Segment options={KINDS} value={kind} onChange={setKind} />
      </View>
      <MyListToolbar sort={sort} onSort={setSort} />
      {favError ? <Text style={styles.err}>{favError}</Text> : null}
      {loading ? (
        <CenterState loading />
      ) : rows.length === 0 ? (
        <CenterState
          message={
            loadFailed
              ? LIST_LOAD_ERROR_MESSAGE
              : "まだお気に入りがありません。カードの★から追加できます。"
          }
        />
      ) : (
        <FlatList
          data={rows}
          keyExtractor={(r) => `${r.kind}-${r.card.id}`}
          contentContainerStyle={styles.feed}
          renderItem={({ item }) =>
            item.kind === "game" ? (
              <KifuCard
                title={item.card.title || "（無題の半荘）"}
                badges={[
                  { label: "牌譜", tone: "muted" },
                  {
                    label: item.card.mine
                      ? "自分"
                      : authorLabel({
                          handle: item.card.ownerHandle,
                          name: item.card.ownerName,
                        }),
                    tone: "accent",
                  },
                ]}
                metaParts={[relativeTime(item.card.createdAt), `${item.card.kyokuCount}局`]}
                fav={item.card.viewerFaved}
                favCount={item.card.favoriteCount}
                onToggleFav={() => toggleFav("game", item.card)}
                // 自分の半荘は半荘詳細、他人の半荘は公開ビューアへ。
                onPress={() =>
                  item.card.mine
                    ? nav.navigate("GameDetail", { gameId: item.card.id })
                    : nav.navigate("PublicGame", {
                        gameId: item.card.id,
                        logId: item.card.firstLogId,
                      })
                }
              />
            ) : (
              <KifuCard
                title={item.card.title || "（無題の問題）"}
                badges={[
                  { label: KIND_LABELS[item.card.problem.kind], tone: "muted" },
                  {
                    label: item.card.mine
                      ? "自分"
                      : authorLabel({
                          handle: item.card.ownerHandle,
                          name: item.card.ownerName,
                        }),
                    tone: "accent",
                  },
                ]}
                metaParts={[relativeTime(item.card.createdAt)]}
                fav={item.card.viewerFaved}
                favCount={item.card.favoriteCount}
                onToggleFav={() => toggleFav("problem", item.card)}
                onPress={() => nav.navigate("ProblemAnswer", { problemId: item.card.id })}
              />
            )
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  kindRow: { flexDirection: "row", paddingHorizontal: 16, paddingTop: 10 },
  err: { color: colors.danger, fontSize: 12, paddingHorizontal: 16, paddingTop: 8 },
  feed: { paddingHorizontal: 16, paddingTop: 10, paddingBottom: 20, gap: 10 },
});
