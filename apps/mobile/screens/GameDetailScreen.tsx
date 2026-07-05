import { useFocusEffect, useNavigation, useRoute, type RouteProp } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { collectReviewItems, roundNameForSeq } from "@rigel/ui";
import { useCallback, useState } from "react";
import { FlatList, Pressable, StyleSheet, Text, View } from "react-native";
import { CenterState } from "../components/CenterState";
import { DangerButton } from "../components/DangerButton";
import { createEmptyKifu, deleteGame } from "../lib/api";
import { useAuth } from "../lib/auth";
import { confirmDestructive } from "../lib/confirm";
import { fmtDate } from "../lib/format";
import { colors } from "../lib/theme";
import type { RootStackParamList } from "../lib/navigation";
import { useGame } from "../lib/use-kifu-data";

type Nav = NativeStackNavigationProp<RootStackParamList, "GameDetail">;

export function GameDetailScreen() {
  const nav = useNavigation<Nav>();
  const { gameId } = useRoute<RouteProp<RootStackParamList, "GameDetail">>().params;
  const { token } = useAuth();
  const { loading, detail, refetch } = useGame(gameId);
  const [adding, setAdding] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  // 編集・局追加/削除から戻ったとき一覧を最新化する（静かに再取得）。
  useFocusEffect(
    useCallback(() => {
      refetch();
    }, [refetch]),
  );

  if (loading) return <CenterState loading />;
  if (!detail) return <CenterState message="半荘が見つかりませんでした。" />;

  // 新しい局は既存局と同じ手前席で作る（無ければ東）。作成後その局の編集画面へ。
  const bottomSeat = detail.logs[0]?.kifu.cameraBottomSeat ?? "east";
  async function onAddKyoku() {
    if (!token || adding) return;
    setAdding(true);
    setNote(null);
    try {
      const res = await createEmptyKifu(token, gameId, bottomSeat);
      if (res.ok) nav.navigate("Edit", { gameId, logId: res.logId });
      else
        setNote(
          res.status === 403 ? "保存上限に達しています（有料プランへ）" : "追加に失敗しました",
        );
    } catch {
      setNote("通信に失敗しました");
    } finally {
      setAdding(false);
    }
  }

  /** 半荘を配下の全局ごと削除する（確認ダイアログつき。成功で一覧へ戻る）。 */
  function onDeleteGame() {
    if (!token) return;
    confirmDestructive({
      title: "この半荘を削除しますか？",
      message: "配下のすべての局が削除され、元に戻せません。",
      onConfirm: () => {
        deleteGame(token, gameId)
          .then((res) => (res.ok ? nav.goBack() : setNote("削除に失敗しました")))
          .catch(() => setNote("通信に失敗しました"));
      },
    });
  }

  return (
    <View style={styles.container}>
      <View style={styles.head}>
        <Text style={styles.title}>{detail.game.title || "（無題の半荘）"}</Text>
        <Text style={styles.date}>
          {fmtDate(detail.game.createdAt)} ／ {detail.logs.length} 局
        </Text>
        <View style={styles.headActions}>
          <Pressable
            style={[styles.addBtn, adding && styles.addBtnOff]}
            disabled={adding}
            onPress={() => void onAddKyoku()}
            accessibilityRole="button"
            accessibilityLabel="局を追加"
          >
            <Text style={styles.addBtnText}>{adding ? "追加中…" : "＋ 局を追加"}</Text>
          </Pressable>
          <View style={styles.delWrap}>
            <DangerButton label="半荘を削除" onPress={onDeleteGame} />
          </View>
        </View>
        {note ? <Text style={styles.note}>{note}</Text> : null}
      </View>
      <FlatList
        data={detail.logs}
        keyExtractor={(l) => l.id}
        contentContainerStyle={{ gap: 8, padding: 12 }}
        renderItem={({ item }) => {
          const reviews = collectReviewItems(item.kifu).length;
          return (
            <Pressable
              style={styles.card}
              onPress={() => nav.navigate("Board", { gameId, logId: item.id })}
            >
              <Text style={styles.localTitle}>
                {roundNameForSeq(item.seq)}{" "}
                <Text style={styles.result}>{item.kifu.result ?? "—"}</Text>
              </Text>
              <View style={styles.cardRight}>
                {reviews > 0 ? (
                  <Text style={styles.review}>要確認 {reviews}</Text>
                ) : (
                  <Text style={styles.done}>確認済</Text>
                )}
                <Pressable
                  onPress={() => nav.navigate("Edit", { gameId, logId: item.id })}
                  accessibilityRole="button"
                  accessibilityLabel={`第${item.seq}局を編集`}
                  hitSlop={8}
                >
                  <Text style={styles.edit}>編集 ›</Text>
                </Pressable>
              </View>
            </Pressable>
          );
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  head: { padding: 12, paddingBottom: 0 },
  title: { color: colors.white, fontWeight: "700", fontSize: 16 },
  date: { color: colors.w45, fontSize: 12, marginTop: 2 },
  headActions: { flexDirection: "row", marginTop: 10 },
  addBtn: {
    paddingVertical: 9,
    paddingHorizontal: 16,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.accent,
    backgroundColor: colors.accentSoft,
  },
  addBtnOff: { opacity: 0.6 },
  addBtnText: { color: colors.accent, fontWeight: "800", fontSize: 13 },
  delWrap: { marginLeft: "auto" },
  note: { color: colors.vermilion, fontSize: 12, marginTop: 8 },
  card: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: colors.chrome,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
    borderRadius: 8,
    padding: 12,
  },
  localTitle: { color: colors.white, fontWeight: "700" },
  result: { color: colors.w45, fontWeight: "400", fontSize: 13 },
  review: { color: colors.vermilion, fontSize: 12 },
  done: { color: colors.emLite, fontSize: 12 },
  cardRight: { flexDirection: "row", alignItems: "center", gap: 14 },
  edit: { color: colors.accent, fontSize: 12.5, fontWeight: "700" },
});
