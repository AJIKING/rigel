import { useFocusEffect, useNavigation, useRoute, type RouteProp } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import type { KifuStatus, Visibility } from "@rigel/client";
import { resultLabel, roundHonbaLabel, roundNameForSeq, LIMIT_MESSAGES } from "@rigel/ui";
import { useCallback, useEffect, useState } from "react";
import { FlatList, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { CenterState } from "../components/CenterState";
import { Chip } from "../components/Chip";
import { DangerButton } from "../components/DangerButton";
import { PlayersSheet } from "../components/editor/PlayersSheet";
import { RulesSheet } from "../components/editor/RulesSheet";
import { Segment } from "../components/Segment";
import {
  deleteGame,
  deleteKifu,
  setGameStatus,
  setGameVisibility,
  updateGame,
  updateGamePlayers,
  updateGameRules,
} from "../lib/api";
import { useAuth } from "../lib/auth";
import { useAnalysisJob } from "../lib/use-analysis-job";
import { confirmDestructive } from "../lib/confirm";
import { fmtDate } from "../lib/format";
import { colors, radius } from "../lib/theme";
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
  const [editingDate, setEditingDate] = useState(false);
  const [dateDraft, setDateDraft] = useState("");
  const [savingDate, setSavingDate] = useState(false);
  const [rulesOpen, setRulesOpen] = useState(false);
  const [playersOpen, setPlayersOpen] = useState(false);
  // 公開範囲・編集状態は半荘単位。楽観更新（失敗で戻す）。null のうちは局の値を使う。
  const [vis, setVis] = useState<Visibility | null>(null);
  const [stat, setStat] = useState<KifuStatus | null>(null);

  // 編集・局追加/削除から戻ったとき一覧を最新化する（静かに再取得）。
  useFocusEffect(
    useCallback(() => {
      refetch();
    }, [refetch]),
  );

  // 解析ジョブの終端で再取得（この画面を開いたまま「解析中→局が入る」を追従させる）。
  const { settledCount } = useAnalysisJob();
  useEffect(() => {
    refetch();
  }, [settledCount, refetch]);

  if (loading) return <CenterState loading />;
  if (!detail) return <CenterState message="半荘が見つかりませんでした。" />;

  const visibility: Visibility = vis ?? detail.logs[0]?.visibility ?? "private";
  const gameStatus: KifuStatus = stat ?? detail.logs[0]?.status ?? "draft";

  /** 半荘の編集状態（下書き/編集済）を切り替える（配下の全局に反映）。 */
  async function onToggleStatus(next: KifuStatus) {
    if (!token || next === gameStatus) return;
    setNote(null);
    setStat(next);
    const res = await setGameStatus(token, gameId, next).catch(() => ({ ok: false, status: 0 }));
    if (!res.ok) {
      setStat(gameStatus);
      setNote(
        res.status === 403
          ? next === "draft"
            ? LIMIT_MESSAGES.draftGames
            : LIMIT_MESSAGES.privateGames
          : "編集状態の保存に失敗しました",
      );
    } else refetch();
  }

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

  /** 対局日（createdAt）の変更を保存する（YYYY-MM-DD。所有者のみ。一覧の並びにも反映）。 */
  async function onSaveDate() {
    if (!token) return;
    setNote(null);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateDraft) || Number.isNaN(Date.parse(dateDraft))) {
      setNote("日付は YYYY-MM-DD 形式で入力してください");
      return;
    }
    setSavingDate(true);
    const res = await updateGame(token, gameId, { createdAt: dateDraft }).catch(() => ({
      ok: false,
      status: 0,
    }));
    setSavingDate(false);
    if (res.ok) {
      setEditingDate(false);
      refetch();
    } else setNote("対局日の変更に失敗しました");
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

  /** 半荘の選手情報（選手名・リーグ戦ポイント）を保存する（配下の全局に反映）。 */
  function onSavePlayers(players: Parameters<typeof updateGamePlayers>[2]) {
    if (!token) return;
    setPlayersOpen(false);
    setNote(null);
    updateGamePlayers(token, gameId, players)
      .then((res) => (res.ok ? refetch() : setNote("選手情報の保存に失敗しました")))
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
        {/* 対局日はタップで編集（YYYY-MM-DD。[決定] 2026-07-29 オーナー要望）。 */}
        {editingDate ? (
          <View style={styles.dateEdit}>
            <TextInput
              style={styles.dateInput}
              value={dateDraft}
              onChangeText={setDateDraft}
              placeholder="YYYY-MM-DD"
              placeholderTextColor={colors.w45}
              autoFocus
              maxLength={10}
              keyboardType="numbers-and-punctuation"
              accessibilityLabel="対局日"
            />
            <Pressable
              onPress={() => void onSaveDate()}
              disabled={savingDate}
              accessibilityRole="button"
              accessibilityLabel="対局日を保存"
              hitSlop={8}
            >
              <Text style={styles.titleSave}>{savingDate ? "…" : "保存"}</Text>
            </Pressable>
            <Pressable onPress={() => setEditingDate(false)} accessibilityRole="button" hitSlop={8}>
              <Text style={styles.titleCancel}>取消</Text>
            </Pressable>
          </View>
        ) : (
          <Pressable
            onPress={() => {
              setDateDraft(detail.game.createdAt.slice(0, 10));
              setEditingDate(true);
            }}
            accessibilityRole="button"
            accessibilityLabel="対局日を変更"
          >
            <Text style={styles.date}>
              {fmtDate(detail.game.createdAt)} ／ {detail.logs.length} 局{" "}
              <Text style={styles.editHintSmall}>✎</Text>
            </Text>
          </Pressable>
        )}
        {/* 公開/非公開・下書き/編集済は半荘単位（配下の全局に反映）。2軸を1行に並べる。 */}
        <View style={styles.segRow}>
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
          <Segment
            options={
              [
                ["draft", "下書き"],
                ["complete", "編集済"],
              ] as const
            }
            value={gameStatus}
            onChange={(v) => void onToggleStatus(v)}
          />
        </View>
        {/* 操作は1行に統一: 主要アクション（局を追加=アクセント）→ チップ（Chip 共用）→
            右端に破壊的操作（DangerButton）。radius・高さは他画面のボタンと同じ部品/値。 */}
        <View style={styles.headActions}>
          <Pressable
            style={styles.addBtn}
            onPress={() => nav.navigate("Capture", { gameId })}
            accessibilityRole="button"
            accessibilityLabel="局を追加"
          >
            <Text style={styles.addBtnText}>＋ 局を追加</Text>
          </Pressable>
          <Chip label="ルール設定" a11ySelected={false} onPress={() => setRulesOpen(true)} />
          <Chip label="選手情報" a11ySelected={false} onPress={() => setPlayersOpen(true)} />
          <View style={styles.delWrap}>
            <DangerButton label="半荘を削除" onPress={onDeleteGame} />
          </View>
        </View>
        {note ? <Text style={styles.note}>{note}</Text> : null}
        {/* 解析ジョブの状態（plan 8-3。サーバー導出。0局のうちはここが半荘の"中身"）。 */}
        {detail.analysisStatus === "processing" ? (
          <Text style={styles.analyzing} accessibilityLiveRegion="polite">
            AI解析中です。完了すると局が追加されます（アプリを閉じてもOK）。
          </Text>
        ) : detail.analysisStatus === "failed" ? (
          <Text style={styles.analyzeFailed}>
            解析に失敗しました。「＋ 局を追加」からやり直せます。
          </Text>
        ) : null}
      </View>
      <FlatList
        data={detail.logs}
        keyExtractor={(l) => l.id}
        contentContainerStyle={{ gap: 8, padding: 12 }}
        renderItem={({ item }) => {
          const canDelete = detail.logs.length > 1;
          return (
            <Pressable
              style={styles.card}
              onPress={() => nav.navigate("Board", { gameId, logId: item.id })}
            >
              <Text style={styles.localTitle}>
                {/* 本場も出す：連荘（同じ局順の局）を区別できる唯一の手掛かり（web の局メニューと同じ）。 */}
                {roundHonbaLabel(item.seq, item.kifu.meta.honba)}{" "}
                <Text style={styles.result}>{resultLabel(item.kifu.result)}</Text>
              </Text>
              <View style={styles.cardRight}>
                {/* 「要確認」バッジは表示廃止（[決定] 2026-08-02 オーナー。null 牌は盤面で埋める）。 */}
                <Text style={styles.preview}>プレビュー ›</Text>
                <Pressable
                  onPress={() => nav.navigate("Edit", { gameId, logId: item.id })}
                  accessibilityRole="button"
                  accessibilityLabel={`第${item.seq}局を編集`}
                  hitSlop={8}
                >
                  <Text style={styles.edit}>編集 ›</Text>
                </Pressable>
                {/* 局の削除はこの一覧から（編集画面には置かない）。最後の1局は不可だが、
                    無言で無視すると「壊れている」ように見えるため理由を表示する。 */}
                <Pressable
                  onPress={() =>
                    canDelete
                      ? onDeleteKyoku(item.id, item.seq)
                      : setNote("最後の1局は削除できません（半荘ごと消すには「半荘を削除」）。")
                  }
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
      {/* 選手情報（選手名・リーグ戦ポイント）。ルールと同じく半荘単位で全局に反映する。 */}
      {playersOpen && detail.logs[0] ? (
        <PlayersSheet
          players={detail.logs[0].kifu.players}
          onSave={onSavePlayers}
          onClose={() => setPlayersOpen(false)}
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
  editHintSmall: { color: colors.accent, fontSize: 11 },
  dateEdit: { flexDirection: "row", alignItems: "center", gap: 12, marginTop: 2 },
  dateInput: {
    color: colors.white,
    fontSize: 13,
    fontVariant: ["tabular-nums"],
    borderBottomWidth: 1,
    borderBottomColor: colors.accent,
    paddingVertical: 2,
    minWidth: 120,
  },
  // Segment はボタンが flex:1 で「親の幅」に広がる設計。2軸（公開/編集状態）を1行で半々に。
  segRow: { marginTop: 10, flexDirection: "row", gap: 8 },
  // ボタンは狭い画面・大きめ文字で1行に収まらないことがあるため折返しを許可する。
  headActions: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    gap: 8,
    marginTop: 10,
  },
  // 主要アクション（アクセント塗り）。radius・高さはマイページの＋新規と同じ流儀。
  addBtn: {
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: radius.base,
    backgroundColor: colors.accent,
  },
  addBtnText: { color: "#16181d", fontWeight: "800", fontSize: 13 },
  delWrap: { marginLeft: "auto" },
  analyzing: { color: colors.accent, fontSize: 12.5, fontWeight: "700", marginTop: 6 },
  analyzeFailed: { color: colors.danger, fontSize: 12.5, fontWeight: "700", marginTop: 6 },
  // 本文エラーは danger（theme の規約。vermilion は塗り・記号用）。
  note: { color: colors.danger, fontSize: 12, marginTop: 8 },
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
  preview: { color: colors.w70, fontSize: 12.5, fontWeight: "700" },
  cardRight: { flexDirection: "row", alignItems: "center", gap: 14 },
  edit: { color: colors.accent, fontSize: 12.5, fontWeight: "700" },
  del: { color: colors.vermilion, fontSize: 14, fontWeight: "800" },
  // 無効時は「消えたボタン」ではなく「押せないボタン」に見せる（colors.line は文字には薄すぎる）。
  delOff: { color: colors.w45, opacity: 0.6 },
});
