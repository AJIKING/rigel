import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useEffect, useState } from "react";
import { FlatList, Pressable, StyleSheet, Text, View } from "react-native";
import { AppBar } from "../components/AppBar";
import { CenterState } from "../components/CenterState";
import { KifuCard } from "../components/KifuCard";
import { getPublicProblems, type ProblemPost } from "../lib/api";
import { relativeTime } from "../lib/format";
import type { RootStackParamList } from "../lib/navigation";
import { KIND_LABELS } from "../lib/problems";
import { colors } from "../lib/theme";

type Nav = NativeStackNavigationProp<RootStackParamList, "Home">;

/** 何切る問題の公開一覧（published のみ・新着順、認証不要）。未接続時はエラーにせず空表示。 */
export function ProblemsListScreen() {
  const nav = useNavigation<Nav>();
  const [loading, setLoading] = useState(true);
  const [posts, setPosts] = useState<ProblemPost[]>([]);

  useEffect(() => {
    let active = true;
    getPublicProblems()
      // 新着順（API 既定に頼らず createdAt 降順で固定）。
      .then((list) => [...list].sort((a, b) => b.createdAt.localeCompare(a.createdAt)))
      .catch(() => [] as ProblemPost[])
      .then((list) => {
        if (active) {
          setPosts(list);
          setLoading(false);
        }
      });
    return () => {
      active = false;
    };
  }, []);

  return (
    <View style={styles.root}>
      <AppBar
        title="何切る"
        right={
          <Pressable
            onPress={() => nav.navigate("MyProblems")}
            accessibilityRole="button"
            hitSlop={8}
          >
            <Text style={styles.mineLink}>マイ何切る</Text>
          </Pressable>
        }
      />
      {loading ? (
        <CenterState loading />
      ) : posts.length === 0 ? (
        <CenterState message="まだ公開された問題がありません。" />
      ) : (
        <FlatList
          data={posts}
          keyExtractor={(p) => p.id}
          contentContainerStyle={styles.feed}
          renderItem={({ item }) => (
            <KifuCard
              title={item.title || "（無題の問題）"}
              badges={[{ label: KIND_LABELS[item.problem.kind], tone: "accent" }]}
              metaParts={[relativeTime(item.createdAt)]}
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
  feed: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 20, gap: 10 },
  mineLink: { color: colors.accent, fontSize: 13, fontWeight: "700" },
});
