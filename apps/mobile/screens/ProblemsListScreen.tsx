import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { filterPublicFeed, A11Y_LABELS, PUBLIC_FEED_FILTERS } from "@rigel/ui";
import { useCallback, useEffect, useMemo, useState } from "react";
import { FlatList, StyleSheet, View } from "react-native";
import { AppBar } from "../components/AppBar";
import { CenterState } from "../components/CenterState";
import { KifuCard } from "../components/KifuCard";
import { ListFooter } from "../components/ListFooter";
import { Toolbar } from "../components/Toolbar";
import { getPublicProblems, type ProblemPost } from "../lib/api";
import { relativeTime } from "../lib/format";
import type { RootStackParamList } from "../lib/navigation";
import { KIND_LABELS } from "../lib/problems";
import { colors } from "../lib/theme";
import { useFavorites } from "../lib/use-favorites";
import { useLoadMore } from "../lib/use-load-more";

type Nav = NativeStackNavigationProp<RootStackParamList, "Home">;

// セグメントの表示ラベル（選択肢と意味は @rigel/ui で牌譜一覧・web と共通定義）。
const SEGMENT_LABELS = PUBLIC_FEED_FILTERS.map((f) => f.label);

/**
 * 何切る問題の公開一覧（published のみ、認証不要）。未接続時はエラーにせず空表示。
 * 絞り込み（新着/今週/お気に入り）とお気に入りは公開牌譜一覧（PublicListScreen）と同一のUX。
 * ページングはカーソル方式で、末尾到達（onEndReached）で次ページを追記する
 * （Plan: docs/plans/list-pagination.md 3-5）。
 * 右上の「マイ何切る」導線は廃止（マイページの何切るセグメントと重複。2026-07-29 オーナー）。
 */
export function ProblemsListScreen() {
  const nav = useNavigation<Nav>();
  const [loading, setLoading] = useState(true);
  const [posts, setPosts] = useState<ProblemPost[]>([]);
  // お気に入りはサーバー保存。カードの値に、この画面での操作を重ねる。
  const { apply, toggle: toggleFav } = useFavorites();
  const [filter, setFilter] = useState(0);
  const [q, setQ] = useState("");
  const filterKey = PUBLIC_FEED_FILTERS[filter]!.key;

  // 追加読み込みの機構（多重発火・reset 競合のガード込み）は useLoadMore（全一覧共通）。
  const { loadingMore, moreFailed, loadMore, reset, activeRef } = useLoadMore(
    getPublicProblems,
    useCallback(
      (page: { items: ProblemPost[]; nextCursor: string | null }) =>
        setPosts((prev) => [...prev, ...page.items]),
      [],
    ),
  );

  useEffect(() => {
    activeRef.current = true;
    getPublicProblems()
      .catch(() => ({ items: [] as ProblemPost[], nextCursor: null }))
      .then((page) => {
        if (activeRef.current) {
          setPosts(page.items);
          reset(page.nextCursor);
          setLoading(false);
        }
      });
    return () => {
      activeRef.current = false;
    };
  }, [reset, activeRef]);

  // 絞り込みと新着順ソートは牌譜一覧と共通の filterPublicFeed（API 既定に頼らず固定）。
  // 検索対象はタイトル（web の公開何切ると同じ条件）。
  const shown = useMemo(() => {
    const arr = q ? apply(posts).filter((p) => p.title.includes(q)) : apply(posts);
    return filterPublicFeed(arr, filterKey);
  }, [posts, filterKey, q, apply]);

  return (
    <View style={styles.root}>
      <AppBar title="何切る" />
      <Toolbar
        segments={SEGMENT_LABELS}
        activeIndex={filter}
        onSegmentPress={setFilter}
        search={{
          value: q,
          onChange: setQ,
          placeholder: "問題を検索",
          label: A11Y_LABELS.searchPublicProblems,
        }}
      />
      {loading ? (
        <CenterState loading />
      ) : shown.length === 0 ? (
        <CenterState
          message={
            filterKey === "fav"
              ? "お気に入りした問題がまだありません。"
              : "まだ公開された問題がありません。"
          }
        />
      ) : (
        <FlatList
          testID="problems-list"
          data={shown}
          keyExtractor={(p) => p.id}
          contentContainerStyle={styles.feed}
          onEndReached={loadMore}
          onEndReachedThreshold={0.5}
          ListFooterComponent={<ListFooter loadingMore={loadingMore} moreFailed={moreFailed} />}
          renderItem={({ item }) => (
            <KifuCard
              title={item.title || "（無題の問題）"}
              badges={[{ label: KIND_LABELS[item.problem.kind], tone: "accent" }]}
              metaParts={[relativeTime(item.createdAt)]}
              fav={item.viewerFaved}
              favCount={item.favoriteCount}
              onToggleFav={() => toggleFav("problem", item)}
              onPress={() => nav.navigate("ProblemAnswer", { problemId: item.id })}
            />
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  feed: { paddingHorizontal: 16, paddingTop: 2, paddingBottom: 20, gap: 10 },
});
