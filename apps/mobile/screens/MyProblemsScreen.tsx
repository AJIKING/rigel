import { useFocusEffect, useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import {
  filterMyProblems,
  sortMyList,
  A11Y_LABELS,
  DELETE_CONFIRM,
  LIMIT_MESSAGES,
  LIST_REFRESH_INTERVAL_MS,
  MY_PROBLEM_STATUS_OPTIONS,
  PROBLEM_LIMIT,
  type MyListSortKey,
} from "@rigel/ui";
import { useCallback, useEffect, useMemo, useState } from "react";
import { FlatList, Pressable, StyleSheet, Text, View } from "react-native";
import { CenterState } from "../components/CenterState";
import { Chip } from "../components/Chip";
import { DangerButton } from "../components/DangerButton";
import { MyListToolbar } from "../components/MyListToolbar";
import { StarButton } from "../components/StarButton";
import { Toolbar } from "../components/Toolbar";
import type { ProblemDraftCard } from "@rigel/client";
import {
  deleteProblem,
  deleteProblemDraft,
  getMyProblems,
  listProblemDrafts,
  updateProblem,
  type ProblemPost,
} from "../lib/api";
import { useAuth } from "../lib/auth";
import { confirmDestructive } from "../lib/confirm";
import { relativeTime } from "../lib/format";
import type { RootStackParamList } from "../lib/navigation";
import { KIND_LABELS } from "../lib/problems";
import { colors, radius } from "../lib/theme";
import { useFavorites } from "../lib/use-favorites";

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
  // お気に入りはサーバー保存。並べ替え・絞り込みは牌譜セグメントと同じ形（web と対）。
  const { apply, toggle: toggleFav, error: favError } = useFavorites();
  const [sort, setSort] = useState<MyListSortKey>("new");
  const [favOnly, setFavOnly] = useState(false);
  // 検索・状態フィルタ（web マイページと同一条件。Phase D）。
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<string>("all");

  // 絞り込みの述語は @rigel/ui（web と共通＝挙動の同一性をコピーで担保しない）。
  const shown = useMemo(
    () => sortMyList(filterMyProblems(apply(posts), { q, status, favOnly }), sort),
    [posts, apply, favOnly, status, q, sort],
  );

  // 解析下書き（photo-retention.md）: 写真AI再現の送信で先行作成され、閉じてもここに残る。
  const [drafts, setDrafts] = useState<ProblemDraftCard[]>([]);

  const reload = useCallback(() => {
    if (!token) return;
    getMyProblems(token)
      .catch(() => [] as ProblemPost[])
      .then((list) => {
        setPosts(list);
        setLoading(false);
      });
    listProblemDrafts(token)
      .then(setDrafts)
      // 取得失敗を「下書きなし」に化けさせない（解析中の下書きが消えたと誤解される）。
      .catch(() => setErr("解析下書きを読み込めませんでした。"));
  }, [token]);

  // 編集・作成から戻ったとき一覧を最新化する（牌譜セグメントと同じ流儀）。
  useFocusEffect(
    useCallback(() => {
      reload();
    }, [reload]),
  );

  // 解析中の下書きがある間は 5 秒間隔で再取得（完了・失敗を操作なしで反映）。
  const hasProcessing = drafts.some((d) => d.status === "processing");
  useEffect(() => {
    if (!hasProcessing) return;
    const timer = setInterval(reload, LIST_REFRESH_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [hasProcessing, reload]);

  /** 解析下書きの破棄（写真ごと消える）。 */
  function onDiscardDraft(id: string) {
    if (!token) return;
    confirmDestructive({
      title: DELETE_CONFIRM.problemDraft.title,
      message: DELETE_CONFIRM.problemDraft.message,
      onConfirm: () => {
        deleteProblemDraft(token, id)
          .then((res) => {
            if (res.ok) setDrafts((cur) => cur.filter((d) => d.id !== id));
            else setErr("下書きの破棄に失敗しました。");
          })
          .catch(() => setErr("下書きの破棄に失敗しました。"));
      },
    });
  }

  if (!token) {
    return <CenterState message="サインインするとマイ何切るが使えます。" />;
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
      // 文言は web/mobile 共通の DELETE_CONFIRM（@rigel/ui）。
      ...DELETE_CONFIRM.problem(post.title),
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
      <Toolbar
        search={{
          value: q,
          onChange: setQ,
          placeholder: "問題を検索",
          label: A11Y_LABELS.searchMyProblems,
        }}
      />
      {/* ＋新規はツールバー右端の action スロットへ（タブ間で位置を統一。[決定] 2026-07-29）。
          クォータはツールバー直下の行に出す。 */}
      <MyListToolbar
        sort={sort}
        onSort={setSort}
        statusLabel={A11Y_LABELS.filterProblemStatus}
        statusOptions={MY_PROBLEM_STATUS_OPTIONS}
        status={status}
        onStatus={setStatus}
        favOnly={favOnly}
        onFavOnly={setFavOnly}
        action={
          <Pressable
            style={[styles.newBtn, atLimit && styles.newBtnOff]}
            disabled={atLimit}
            onPress={() => nav.navigate("ProblemEdit")}
            accessibilityRole="button"
          >
            <Text style={styles.newBtnText}>＋ 新規</Text>
          </Pressable>
        }
      />
      <View style={styles.head}>
        {limit !== null ? (
          <Text style={[styles.quota, atLimit && styles.quotaWarn]}>
            {posts.length} / {limit}問
          </Text>
        ) : (
          <Text style={styles.quota}>{posts.length}問（無制限）</Text>
        )}
      </View>
      {atLimit ? <Text style={styles.limitNote}>{LIMIT_MESSAGES.problems}</Text> : null}
      {err ? <Text style={styles.err}>{err}</Text> : null}
      {favError ? <Text style={styles.err}>{favError}</Text> : null}

      {loading ? (
        <CenterState loading />
      ) : shown.length === 0 && drafts.length === 0 ? (
        <CenterState
          message={
            favOnly
              ? "お気に入りした問題はまだありません。"
              : q || status !== "all"
                ? "該当する問題がありません。"
                : "まだ問題がありません。「＋ 新規」から作成できます。"
          }
        />
      ) : (
        <FlatList
          data={shown}
          keyExtractor={(p) => p.id}
          contentContainerStyle={styles.feed}
          // 解析下書き（写真AI再現の受け皿）はリストのヘッダに出す
          // （直置きだと下書きが溜まったとき本体一覧がスクロールできなくなる）。
          // 「下書き」バッジは通常問題の draft と紛れるので「解析完了」と呼び分ける。
          ListHeaderComponent={
            drafts.length > 0 ? (
              <View style={styles.feedHead}>
                {drafts.map((d) => (
                  <View key={d.id} style={styles.card}>
                    <Pressable
                      onPress={() => {
                        if (d.status === "ready") {
                          nav.navigate("ProblemEdit", { draftId: d.id });
                        } else {
                          setErr(
                            d.status === "processing"
                              ? "解析中です。完了するとタップして編集できます。"
                              : "解析に失敗しました。不要であれば「破棄」してください。",
                          );
                        }
                      }}
                      accessibilityRole="button"
                      accessibilityLabel="解析下書き"
                      accessibilityState={{ disabled: d.status !== "ready" }}
                    >
                      <Text style={styles.cardTitle}>解析下書き</Text>
                      <View style={styles.metaRow}>
                        <Text
                          style={
                            d.status === "ready"
                              ? styles.badgePub
                              : d.status === "processing"
                                ? styles.meta
                                : styles.badgeFail
                          }
                        >
                          {d.status === "ready"
                            ? "解析完了"
                            : d.status === "processing"
                              ? "解析中"
                              : "解析失敗"}
                        </Text>
                        <Text style={styles.meta}>{relativeTime(d.createdAt)}</Text>
                      </View>
                    </Pressable>
                    <View style={styles.acts}>
                      <Chip
                        label="破棄"
                        a11ySelected={false}
                        onPress={() => onDiscardDraft(d.id)}
                      />
                    </View>
                  </View>
                ))}
              </View>
            ) : null
          }
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
                    {item.status === "draft" ? "下書き" : "公開"}
                  </Text>
                  <Text style={styles.meta}>{relativeTime(item.createdAt)}</Text>
                </View>
              </Pressable>
              <View style={styles.star}>
                <StarButton
                  on={item.viewerFaved}
                  count={item.favoriteCount}
                  onPress={() => toggleFav("problem", item)}
                />
              </View>
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
  limitNote: { color: colors.danger, fontSize: 12, paddingHorizontal: 16, paddingBottom: 4 },
  err: { color: colors.danger, fontSize: 12, paddingHorizontal: 16, paddingBottom: 4 },
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
  /* 解析失敗（下書きの注意色と混同しない danger 系）。 */
  badgeFail: { color: colors.danger, fontSize: 11.5, fontWeight: "700" },
  /* 解析下書きのヘッダ枠（FlatList の ListHeaderComponent。本体カードと同じ間隔）。 */
  feedHead: { gap: 10, marginBottom: 10 },
  meta: { color: colors.w45, fontSize: 11.5 },
  acts: { flexDirection: "row", alignItems: "center", gap: 8 },
  star: { position: "absolute", top: 8, right: 8 },
});
