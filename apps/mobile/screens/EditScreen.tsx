import { useRoute, type RouteProp } from "@react-navigation/native";
import { useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { CenterState } from "../components/CenterState";
import { KifuEditor } from "../components/KifuEditor";
import { updateKifu } from "../lib/api";
import { useAuth } from "../lib/auth";
import type { RootStackParamList } from "../lib/navigation";
import { colors } from "../lib/theme";
import { useGame } from "../lib/use-kifu-data";

/** 牌譜の編集画面（手入力）。取得と保存だけを担い、編集本体は KifuEditor。 */
export function EditScreen() {
  const { gameId, logId } = useRoute<RouteProp<RootStackParamList, "Edit">>().params;
  const { token } = useAuth();
  const { loading, detail } = useGame(gameId);
  const [saving, setSaving] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  if (loading) return <CenterState loading />;
  const log = detail?.logs.find((l) => l.id === logId);
  if (!detail || !log) return <CenterState message="牌譜が見つかりませんでした。" />;

  return (
    <View style={styles.root}>
      {note ? <Text style={styles.note}>{note}</Text> : null}
      <KifuEditor
        initialKifu={log.kifu}
        seq={log.seq}
        initialStatus={log.status}
        saving={saving}
        onSave={(kifu, status) => {
          if (!token) return;
          setSaving(true);
          setNote(null);
          updateKifu(token, logId, kifu, status)
            .then((res) => {
              if (res.ok) setNote("保存しました");
              else if (res.status === 403)
                setNote(
                  status === "complete"
                    ? "非公開の保存上限に達しています（有料プランへ）"
                    : "無料プランの下書きは5件までです",
                );
              else setNote("保存に失敗しました");
            })
            .catch(() => setNote("通信に失敗しました"))
            .finally(() => setSaving(false));
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  note: {
    color: colors.accent,
    fontSize: 12.5,
    fontWeight: "700",
    textAlign: "center",
    paddingTop: 8,
  },
});
