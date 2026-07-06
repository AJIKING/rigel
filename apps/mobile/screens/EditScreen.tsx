import { useRoute, type RouteProp } from "@react-navigation/native";
import { LIMIT_MESSAGES } from "@rigel/ui";
import { useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { CenterState } from "../components/CenterState";
import { KifuEditor } from "../components/editor/KifuEditor";
import { updateKifu } from "../lib/api";
import { useAuth } from "../lib/auth";
import type { RootStackParamList } from "../lib/navigation";
import { colors } from "../lib/theme";
import { useGame } from "../lib/use-kifu-data";

/** 牌譜の編集画面（手入力）。取得・保存を担い、編集本体は KifuEditor。
 *  公開/非公開は半荘単位（半荘詳細で切替）、局の削除も半荘詳細の一覧から行う。 */
export function EditScreen() {
  const { gameId, logId } = useRoute<RouteProp<RootStackParamList, "Edit">>().params;
  const { token } = useAuth();
  const { loading, detail } = useGame(gameId);
  const [saving, setSaving] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  if (loading) return <CenterState loading />;
  const log = detail?.logs.find((l) => l.id === logId);
  if (!detail || !log) return <CenterState message="牌譜が見つかりませんでした。" />;

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
        <Text style={styles.title} numberOfLines={1}>
          {detail.game.title || "（無題の半荘）"}
        </Text>
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
  toolbar: { paddingHorizontal: 14, paddingTop: 10 },
  title: { color: colors.w70, fontSize: 13, fontWeight: "700" },
  note: {
    color: colors.accent,
    fontSize: 12.5,
    fontWeight: "700",
    textAlign: "center",
    paddingTop: 8,
  },
});
