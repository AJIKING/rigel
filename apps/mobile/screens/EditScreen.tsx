import { useNavigation, useRoute, type RouteProp } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import type { Visibility } from "@rigel/client";
import { useState } from "react";
import { Alert, Pressable, StyleSheet, Text, View } from "react-native";
import { CenterState } from "../components/CenterState";
import { KifuEditor } from "../components/editor/KifuEditor";
import { Segment } from "../components/Segment";
import { deleteKifu, setVisibility, updateKifu } from "../lib/api";
import { useAuth } from "../lib/auth";
import type { RootStackParamList } from "../lib/navigation";
import { colors, radius } from "../lib/theme";
import { useGame } from "../lib/use-kifu-data";

type Nav = NativeStackNavigationProp<RootStackParamList, "Edit">;

/** 牌譜の編集画面（手入力）。取得・保存・公開範囲・局削除を担い、編集本体は KifuEditor。 */
export function EditScreen() {
  const { gameId, logId } = useRoute<RouteProp<RootStackParamList, "Edit">>().params;
  const nav = useNavigation<Nav>();
  const { token } = useAuth();
  const { loading, detail } = useGame(gameId);
  const [saving, setSaving] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  // 公開範囲は楽観更新（失敗で戻す）。null のうちは牌譜の値を使う。
  const [vis, setVis] = useState<Visibility | null>(null);

  if (loading) return <CenterState loading />;
  const log = detail?.logs.find((l) => l.id === logId);
  if (!detail || !log) return <CenterState message="牌譜が見つかりませんでした。" />;

  const visibility: Visibility = vis ?? log.visibility;
  const canDelete = detail.logs.length > 1;

  async function onToggleVis(next: Visibility) {
    if (!token || next === visibility) return;
    setNote(null);
    setVis(next);
    const res = await setVisibility(token, logId, next).catch(() => ({ ok: false, status: 0 }));
    if (!res.ok) {
      setVis(visibility);
      setNote("公開設定の保存に失敗しました");
    }
  }

  function onDelete() {
    if (!token || !canDelete) return;
    Alert.alert("この局を削除しますか？", "元に戻せません。", [
      { text: "キャンセル", style: "cancel" },
      {
        text: "削除",
        style: "destructive",
        onPress: () => {
          deleteKifu(token, logId)
            .then((res) => (res.ok ? nav.goBack() : setNote("削除に失敗しました")))
            .catch(() => setNote("通信に失敗しました"));
        },
      },
    ]);
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
          setNote(
            status === "complete"
              ? "非公開の保存上限に達しています（有料プランへ）"
              : "無料プランの下書きは5件までです",
          );
        else setNote("保存に失敗しました");
      })
      .catch(() => setNote("通信に失敗しました"))
      .finally(() => setSaving(false));
  }

  return (
    <View style={styles.root}>
      <View style={styles.toolbar}>
        <View style={styles.visWrap}>
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
        <Pressable
          style={[styles.delBtn, !canDelete && styles.delOff]}
          disabled={!canDelete}
          onPress={onDelete}
          accessibilityRole="button"
          accessibilityLabel="この局を削除"
        >
          <Text style={[styles.delText, !canDelete && styles.delTextOff]}>削除</Text>
        </Pressable>
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
  visWrap: { flex: 1 },
  delBtn: {
    paddingVertical: 9,
    paddingHorizontal: 16,
    borderRadius: radius.base,
    borderWidth: 1,
    borderColor: colors.vermilion,
  },
  delOff: { borderColor: colors.line },
  delText: { color: colors.vermilion, fontWeight: "800", fontSize: 13 },
  delTextOff: { color: colors.w45 },
  note: {
    color: colors.accent,
    fontSize: 12.5,
    fontWeight: "700",
    textAlign: "center",
    paddingTop: 8,
  },
});
