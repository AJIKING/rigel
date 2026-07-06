import { useFocusEffect, useNavigation, useRoute, type RouteProp } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import type { Visibility } from "@rigel/client";
import { collectReviewItems, resultLabel, roundNameForSeq, LIMIT_MESSAGES } from "@rigel/ui";
import { useCallback, useState } from "react";
import { FlatList, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { CenterState } from "../components/CenterState";
import { DangerButton } from "../components/DangerButton";
import { RulesSheet } from "../components/editor/RulesSheet";
import { Segment } from "../components/Segment";
import { deleteGame, deleteKifu, setGameVisibility, updateGame, updateGameRules } from "../lib/api";
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
  const [note, setNote] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState("");
  const [savingTitle, setSavingTitle] = useState(false);
  const [rulesOpen, setRulesOpen] = useState(false);
  // 公開範囲は半荘単位。楽観更新（失敗で戻す）。null のうちは局の値を使う。
  const [vis, setVis] = useState<Visibility | null>(null);

  // 編集・局追加/削除から戻ったとき一覧を最新化する（静かに再取得）。
  useFocusEffect(
    useCallback(() => {
      refetch();
    }, [refetch]),
  );

  if (loading) return <CenterState loading />;
  if (!detail) return <CenterState message="半荘が見つかりませんでした。" />;

  const visibility: Visibility = vis ?? detail.logs[0]?.visibility ?? "private";

  /** 半荘の公開範囲を切り替える（配下の全局に反映）。 */
  async function onToggleVis(next: Visibility) {
    if (!token || next === visibility) return;
    setNote(null);
    setVis(next);
    const res = await setGameVisibility(token, gameId, next).catch(() => ({
      ok: false,
      status: 0,
    }));
    if (!res.ok) {
      setVis(visibility);
      setNote(res.status === 403 ? LIMIT_MESSAGES.privateGames : "公開設定の保存に失敗しました");
    } else refetch();
  }

  /** 半荘名の変更を保存する（所有者のみ）。成功で一覧を最新化。 */
  async function onSaveTitle() {
    if (!token) return;
    setSavingTitle(true);
    setNote(null);
    const res = await updateGame(token, gameId, { title: titleDraft }).catch(() => ({
      ok: false,
      status: 0,
    }));
    setSavingTitle(false);
    if (res.ok) {
      setEditingTitle(false);
      refetch();
    } else setNote("名称の変更に失敗しました");
  }

  /** 半荘のルールを保存する（配下の全局に反映。局ごとには持たない）。 */
  function onSaveRules(rules: Parameters<typeof updateGameRules>[2]) {
    if (!token) return;
    setRulesOpen(false);
    setNote(null);
    updateGameRules(token, gameId, rules)
      .then((res) => (res.ok ? refetch() : setNote("ルールの保存に失敗しました")))
      .catch(() => setNote("通信に失敗しました"));
  }

  /** 局を1つ削除する（確認つき。最後の1局は消せない）。局の削除はこの一覧からだけ行う。 */
  function onDeleteKyoku(logId: string, seq: number) {
    if (!token) return;
    confirmDestructive({
      title: `${roundNameForSeq(seq)}を削除しますか？`,
      message: "元に戻せません。",
      onConfirm: () => {
        deleteKifu(token, logId)
          .then((res) => (res.ok ? refetch() : setNote("削除に失敗しました")))
          .catch(() => setNote("通信に失敗しました"));
      },
    });
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
        {editingTitle ? (
          <View style={styles.titleEdit}>
            <TextInput
              style={styles.titleInput}
              value={titleDraft}
              onChangeText={setTitleDraft}
              placeholder="半荘名"
              placeholderTextColor={colors.w45}
              autoFocus
              maxLength={80}
              accessibilityLabel="半荘名"
            />
            <Pressable
              onPress={() => void onSaveTitle()}
              disabled={savingTitle}
              accessibilityRole="button"
              accessibilityLabel="半荘名を保存"
              hitSlop={8}
            >
              <Text style={styles.titleSave}>{savingTitle ? "…" : "保存"}</Text>
            </Pressable>
            <Pressable
              onPress={() => setEditingTitle(false)}
              accessibilityRole="button"
              hitSlop={8}
            >
              <Text style={styles.titleCancel}>取消</Text>
            </Pressable>
          </View>
        ) : (
          <Pressable
            onPress={() => {
              setTitleDraft(detail.game.title);
              setEditingTitle(true);
            }}
            accessibilityRole="button"
            accessibilityLabel="半荘名を変更"
          >
            <Text style={styles.title}>
              {detail.game.title || "（無題の半荘）"} <Text style={styles.editHint}>✎</Text>
            </Text>
          </Pressable>
        )}
        <Text style={styles.date}>
          {fmtDate(detail.game.createdAt)} ／ {detail.logs.length} 局
        </Text>
        {/* 公開/非公開は半荘単位（配下の全局に反映）。 */}
        <View style={styles.visRow}>
          <Segment
            options={
              [
                ["private", "非公開"],
                ["public", "公開"],
              ] as const
            }
            value={visibility}
            onChange={(v) => void onToggleVis(v)}
          />
        </View>
        <View style={styles.headActions}>
          <Pressable
            style={styles.addBtn}
            onPress={() => nav.navigate("Capture", { gameId })}
            accessibilityRole="button"
            accessibilityLabel="局を追加"
          >
            <Text style={styles.addBtnText}>＋ 局を追加</Text>
          </Pressable>
          <Pressable
            style={styles.rulesBtn}
            onPress={() => setRulesOpen(true)}
            accessibilityRole="button"
            accessibilityLabel="ルール設定"
          >
            <Text style={styles.rulesBtnText}>⚙ ルール設定</Text>
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
          const canDelete = detail.logs.length > 1;
          return (
            <Pressable
              style={styles.card}
              onPress={() => nav.navigate("Board", { gameId, logId: item.id })}
            >
              <Text style={styles.localTitle}>
                {roundNameForSeq(item.seq)}{" "}
                <Text style={styles.result}>{resultLabel(item.kifu.result)}</Text>
              </Text>
              <View style={styles.cardRight}>
                {reviews > 0 ? <Text style={styles.review}>要確認 {reviews}</Text> : null}
                <Text style={styles.preview}>プレビュー ›</Text>
                <Pressable
                  onPress={() => nav.navigate("Edit", { gameId, logId: item.id })}
                  accessibilityRole="button"
                  accessibilityLabel={`第${item.seq}局を編集`}
                  hitSlop={8}
                >
                  <Text style={styles.edit}>編集 ›</Text>
                </Pressable>
                {/* 局の削除はこの一覧から（編集画面には置かない）。最後の1局は不可。 */}
                <Pressable
                  onPress={() => onDeleteKyoku(item.id, item.seq)}
                  disabled={!canDelete}
                  accessibilityRole="button"
                  accessibilityLabel={`第${item.seq}局を削除`}
                  hitSlop={8}
                >
                  <Text style={[styles.del, !canDelete && styles.delOff]}>✕</Text>
                </Pressable>
              </View>
            </Pressable>
          );
        }}
      />
      {rulesOpen && detail.logs[0] ? (
        <RulesSheet
          rules={detail.logs[0].kifu.rules}
          onSave={onSaveRules}
          onClose={() => setRulesOpen(false)}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  head: { padding: 12, paddingBottom: 0 },
  title: { color: colors.white, fontWeight: "700", fontSize: 16 },
  editHint: { color: colors.accent, fontSize: 13 },
  titleEdit: { flexDirection: "row", alignItems: "center", gap: 12 },
  titleInput: {
    flex: 1,
    color: colors.white,
    fontSize: 16,
    fontWeight: "700",
    borderBottomWidth: 1,
    borderBottomColor: colors.accent,
    paddingVertical: 2,
  },
  titleSave: { color: colors.accent, fontWeight: "800", fontSize: 13 },
  titleCancel: { color: colors.w45, fontWeight: "700", fontSize: 13 },
  date: { color: colors.w45, fontSize: 12, marginTop: 2 },
  visRow: { marginTop: 10, alignSelf: "flex-start" },
  // ボタン3つは狭い画面・大きめ文字で1行に収まらないことがあるため折返しを許可する。
  headActions: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    gap: 8,
    marginTop: 10,
  },
  addBtn: {
    paddingVertical: 9,
    paddingHorizontal: 16,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.accent,
    backgroundColor: colors.accentSoft,
  },
  addBtnText: { color: colors.accent, fontWeight: "800", fontSize: 13 },
  rulesBtn: {
    paddingVertical: 9,
    paddingHorizontal: 14,
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
    backgroundColor: colors.chrome2,
  },
  rulesBtnText: { color: colors.w70, fontWeight: "700", fontSize: 12.5 },
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
  preview: { color: colors.w70, fontSize: 12.5, fontWeight: "700" },
  cardRight: { flexDirection: "row", alignItems: "center", gap: 14 },
  edit: { color: colors.accent, fontSize: 12.5, fontWeight: "700" },
  del: { color: colors.vermilion, fontSize: 14, fontWeight: "800" },
  delOff: { color: colors.line },
});
