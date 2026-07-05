import { useNavigation, useRoute, type RouteProp } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { LIMIT_MESSAGES } from "@rigel/ui";
import { useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { CenterState } from "../components/CenterState";
import { DangerButton } from "../components/DangerButton";
import { KifuEditor } from "../components/editor/KifuEditor";
import { deleteKifu, updateKifu } from "../lib/api";
import { useAuth } from "../lib/auth";
import { confirmDestructive } from "../lib/confirm";
import type { RootStackParamList } from "../lib/navigation";
import { colors } from "../lib/theme";
import { useGame } from "../lib/use-kifu-data";

type Nav = NativeStackNavigationProp<RootStackParamList, "Edit">;

/** 牌譜の編集画面（手入力）。取得・保存・局削除を担い、編集本体は KifuEditor。
 *  公開/非公開は局ごとに選ばず半荘単位（半荘詳細画面で切り替える）。 */
export function EditScreen() {
  const { gameId, logId } = useRoute<RouteProp<RootStackParamList, "Edit">>().params;
  const nav = useNavigation<Nav>();
  const { token } = useAuth();
  const { loading, detail } = useGame(gameId);
  const [saving, setSaving] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  if (loading) return <CenterState loading />;
  const log = detail?.logs.find((l) => l.id === logId);
  if (!detail || !log) return <CenterState message="牌譜が見つかりませんでした。" />;

  const canDelete = detail.logs.length > 1;

  function onDelete() {
    if (!token || !canDelete) return;
    confirmDestructive({
      title: "この局を削除しますか？",
      message: "元に戻せません。",
      onConfirm: () => {
        deleteKifu(token, logId)
          .then((res) => (res.ok ? nav.goBack() : setNote("削除に失敗しました")))
          .catch(() => setNote("通信に失敗しました"));
      },
    });
  }

  function onSave(
    kifu: Parameters<typeof updateKifu>[2],
    status: Parameters<typeof updateKifu>[3],
  ) {
    if (!token) return;
    setSaving(true);
    setNote(null);
    updateKifu(token, logId, kifu, status)
      .then((res) => {
        if (res.ok) setNote("保存しました");
        else if (res.status === 403)
          setNote(status === "complete" ? LIMIT_MESSAGES.privateGames : LIMIT_MESSAGES.draftGames);
        else setNote("保存に失敗しました");
      })
      .catch(() => setNote("通信に失敗しました"))
      .finally(() => setSaving(false));
  }

  return (
    <View style={styles.root}>
      <View style={styles.toolbar}>
        <Text style={styles.title}>{detail.game.title || "（無題の半荘）"}</Text>
        <DangerButton
          label="削除"
          a11yLabel="この局を削除"
          disabled={!canDelete}
          onPress={onDelete}
        />
      </View>
      {note ? <Text style={styles.note}>{note}</Text> : null}
      <KifuEditor
        initialKifu={log.kifu}
        seq={log.seq}
        initialStatus={log.status}
        saving={saving}
        onSave={onSave}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  toolbar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 14,
    paddingTop: 10,
  },
  title: { flex: 1, color: colors.w70, fontSize: 13, fontWeight: "700" },
  note: {
    color: colors.accent,
    fontSize: 12.5,
    fontWeight: "700",
    textAlign: "center",
    paddingTop: 8,
  },
});
