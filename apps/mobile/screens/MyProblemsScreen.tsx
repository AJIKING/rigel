import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { LIMIT_MESSAGES, PROBLEM_LIMIT } from "@rigel/ui";
import { useEffect, useState } from "react";
import { FlatList, Pressable, StyleSheet, Text, View } from "react-native";
import { CenterState } from "../components/CenterState";
import { Chip } from "../components/Chip";
import { DangerButton } from "../components/DangerButton";
import { deleteProblem, getMyProblems, updateProblem, type ProblemPost } from "../lib/api";
import { useAuth } from "../lib/auth";
import { confirmDestructive } from "../lib/confirm";
import { relativeTime } from "../lib/format";
import type { RootStackParamList } from "../lib/navigation";
import { KIND_LABELS } from "../lib/problems";
import { colors, radius } from "../lib/theme";

type Nav = NativeStackNavigationProp<RootStackParamList, "Home">;

/**
 * マイ何切る（自分の問題の管理。マイページの何切るセグメントとして表示）。
 * 状態は draft / published の二択。
 * free は draft+published 合算 20 問まで（PROBLEM_LIMIT。上限で警告文言）。
 */
export function MyProblemsScreen() {
  const nav = useNavigation<Nav>();
  const { user, token } = useAuth();
  const [loading, setLoading] = useState(true);
  const [posts, setPosts] = useState<ProblemPost[]>([]);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    let active = true;
    getMyProblems(token)
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
  }, [token]);

  if (!token) {
    return <CenterState message="ログインするとマイ何切るが使えます。" />;
  }

  const limit = PROBLEM_LIMIT[user?.plan ?? "free"];
  const atLimit = limit !== null && posts.length >= limit;

  /** draft⇔published の切替（楽観更新・失敗でロールバック）。 */
  function toggleStatus(post: ProblemPost) {
    if (!token) return;
    const next = post.status === "draft" ? "published" : "draft";
    setPosts((cur) => cur.map((p) => (p.id === post.id ? { ...p, status: next } : p)));
    updateProblem(token, post.id, { status: next })
      .then((res) => {
        if (!res.ok) throw new Error("failed");
      })
      .catch(() => {
        setPosts((cur) => cur.map((p) => (p.id === post.id ? { ...p, status: post.status } : p)));
        setErr("状態の変更に失敗しました。");
      });
  }

  /** 削除（確認ダイアログ→成功で一覧から除去）。 */
  function onDelete(post: ProblemPost) {
    if (!token) return;
    confirmDestructive({
      title: `「${post.title || "無題の問題"}」を削除しますか？`,
      message: "回答の分布も削除され、元に戻せません。",
      onConfirm: () => {
        deleteProblem(token, post.id)
          .then((res) => {
            if (res.ok) setPosts((cur) => cur.filter((p) => p.id !== post.id));
            else setErr("削除に失敗しました。");
          })
          .catch(() => setErr("削除に失敗しました。"));
      },
    });
  }

  return (
    <View style={styles.root}>
      <View style={styles.head}>
        {limit !== null ? (
          <Text style={[styles.quota, atLimit && styles.quotaWarn]}>
            {posts.length} / {limit}問
          </Text>
        ) : (
          <Text style={styles.quota}>{posts.length}問（無制限）</Text>
        )}
        <Pressable
          style={[styles.newBtn, atLimit && styles.newBtnOff]}
          disabled={atLimit}
          onPress={() => nav.navigate("ProblemEdit")}
          accessibilityRole="button"
        >
          <Text style={styles.newBtnText}>＋ 新しい問題</Text>
        </Pressable>
      </View>
      {atLimit ? <Text style={styles.limitNote}>{LIMIT_MESSAGES.problems}</Text> : null}
      {err ? <Text style={styles.err}>{err}</Text> : null}

      {loading ? (
        <CenterState loading />
      ) : posts.length === 0 ? (
        <CenterState message="まだ問題がありません。「＋ 新しい問題」から作成できます。" />
      ) : (
        <FlatList
          data={posts}
          keyExtractor={(p) => p.id}
          contentContainerStyle={styles.feed}
          renderItem={({ item }) => (
            <View style={styles.card}>
              <Pressable
                onPress={() => nav.navigate("ProblemAnswer", { problemId: item.id })}
                accessibilityRole="button"
              >
                <Text style={styles.cardTitle}>{item.title || "（無題の問題）"}</Text>
                <View style={styles.metaRow}>
                  <Text style={styles.kind}>{KIND_LABELS[item.problem.kind]}</Text>
                  <Text style={item.status === "draft" ? styles.badgeDraft : styles.badgePub}>
                    {item.status === "draft" ? "下書き" : "公開中"}
                  </Text>
                  <Text style={styles.meta}>{relativeTime(item.createdAt)}</Text>
                </View>
              </Pressable>
              <View style={styles.acts}>
                <Chip
                  label={item.status === "draft" ? "公開する" : "下書きに戻す"}
                  a11ySelected={false}
                  onPress={() => toggleStatus(item)}
                />
                <Chip
                  label="編集"
                  a11ySelected={false}
                  onPress={() => nav.navigate("ProblemEdit", { problemId: item.id })}
                />
                <DangerButton label="削除" onPress={() => onDelete(item)} />
              </View>
            </View>
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
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 4,
  },
  quota: { color: colors.w70, fontSize: 12.5, fontWeight: "700" },
  quotaWarn: { color: colors.vermilion },
  newBtn: {
    backgroundColor: colors.accent,
    borderRadius: radius.base,
    paddingVertical: 8,
    paddingHorizontal: 14,
  },
  newBtnOff: { opacity: 0.4 },
  newBtnText: { color: "#16181d", fontWeight: "800", fontSize: 13 },
  limitNote: { color: colors.vermilion, fontSize: 12, paddingHorizontal: 16, paddingBottom: 4 },
  err: { color: colors.vermilion, fontSize: 12, paddingHorizontal: 16, paddingBottom: 4 },
  feed: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 20, gap: 10 },
  card: {
    padding: 12,
    gap: 10,
    backgroundColor: colors.chrome,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
    borderRadius: radius.card,
  },
  cardTitle: { color: colors.white, fontSize: 14, fontWeight: "700", marginBottom: 5 },
  metaRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  kind: { color: colors.accent, fontSize: 11.5, fontWeight: "700" },
  badgeDraft: { color: colors.vermilion, fontSize: 11.5, fontWeight: "700" },
  badgePub: { color: colors.accent, fontSize: 11.5, fontWeight: "700" },
  meta: { color: colors.w45, fontSize: 11.5 },
  acts: { flexDirection: "row", alignItems: "center", gap: 8 },
});
