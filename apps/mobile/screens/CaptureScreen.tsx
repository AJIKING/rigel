import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { SeatSchema, type Seat } from "@rigel/schema";
import { analyzeErrorMessage, cameraLabel, seatLabel } from "@rigel/ui";
import { useState } from "react";
import { Image, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { analyze, createGame } from "../lib/api";
import { useAuth } from "../lib/auth";
import type { RootStackParamList } from "../lib/navigation";
import { pickImage, type PickedImage as Picked } from "../lib/pick-image";
import { colors } from "../lib/theme";

type Nav = NativeStackNavigationProp<RootStackParamList, "Capture">;

const CAMS = ["bottom", "right", "top", "left"] as const;

export function CaptureScreen() {
  const nav = useNavigation<Nav>();
  const { token } = useAuth();
  const [seat, setSeat] = useState<Seat>("east");
  const [river, setRiver] = useState<Picked | null>(null);
  const [hands, setHands] = useState<Partial<Record<(typeof CAMS)[number], Picked>>>({});
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /** 写真なしの手入力作成。空の初局つき半荘を作って編集画面へ。 */
  async function onCreateManual() {
    if (!token) {
      setError("ログインが必要です。");
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      const res = await createGame(token, seat);
      if (res.ok) nav.navigate("Edit", { gameId: res.gameId, logId: res.logId });
      else setError("作成に失敗しました。");
    } catch {
      setError("通信に失敗しました。");
    } finally {
      setSubmitting(false);
    }
  }

  /** 写真を選んで onPicked に渡す。拒否時は設定誘導（pickImage 内）＋インライン表示。 */
  async function pickInto(onPicked: (file: Picked) => void) {
    const result = await pickImage();
    if (result.status === "picked") {
      setError(null);
      onPicked(result.file);
    } else if (result.status === "denied") {
      setError("写真へのアクセスが許可されていません。設定アプリから許可してください。");
    }
  }

  async function onSubmit() {
    if (!token) {
      setError("ログインが必要です。");
      return;
    }
    if (!river) {
      setError("河（卓を上から1枚）の写真を選んでください。");
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      const form = new FormData();
      // RN の FormData はファイルを {uri,name,type} で受け取る（DOM 型に合わせて cast）。
      form.append("river", river as unknown as Blob);
      form.append("cameraBottomSeat", seat);
      for (const cam of CAMS) {
        const f = hands[cam];
        if (f) form.append(`hand_${cam}`, f as unknown as Blob);
      }
      const result = await analyze(token, form);
      if (result.ok) {
        nav.navigate("GameDetail", { gameId: result.gameId });
        return;
      }
      setError(analyzeErrorMessage(result.status, result.reason));
    } catch {
      setError("通信に失敗しました。");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <ScrollView style={styles.root} contentContainerStyle={styles.container}>
      <Text style={styles.label}>手前（カメラ手前）の席</Text>
      <View style={styles.seatRow}>
        {SeatSchema.options.map((s) => (
          <Pressable
            key={s}
            onPress={() => setSeat(s)}
            style={[styles.seatBtn, seat === s && styles.seatActive]}
          >
            <Text style={seat === s ? styles.seatActiveText : undefined}>{seatLabel(s)}</Text>
          </Pressable>
        ))}
      </View>

      <Text style={styles.label}>河（卓を上から1枚）*</Text>
      <Pressable style={styles.pick} onPress={() => void pickInto(setRiver)}>
        {river ? (
          <Image source={{ uri: river.uri }} style={styles.thumb} />
        ) : (
          <Text style={styles.pickText}>河の写真を選ぶ</Text>
        )}
      </Pressable>

      <Text style={styles.label}>各家の手牌（任意）</Text>
      {CAMS.map((cam) => (
        <Pressable
          key={cam}
          style={styles.handRow}
          onPress={() => void pickInto((p) => setHands((h) => ({ ...h, [cam]: p })))}
        >
          <Text style={styles.handLabel}>{cameraLabel(cam)}</Text>
          {hands[cam] ? (
            <Image source={{ uri: hands[cam]?.uri }} style={styles.thumbSmall} />
          ) : (
            <Text style={styles.pickText}>選ぶ</Text>
          )}
        </Pressable>
      ))}

      {error ? <Text style={styles.error}>{error}</Text> : null}

      <Pressable
        disabled={submitting || !river}
        onPress={() => void onSubmit()}
        style={[styles.submit, (submitting || !river) && styles.submitDisabled]}
      >
        <Text style={styles.submitText}>
          {submitting ? "解析中…（少し時間がかかります）" : "解析して保存"}
        </Text>
      </Pressable>

      {/* 写真なしの手入力作成（空の初局を作って編集画面へ）。 */}
      <Pressable
        disabled={submitting}
        onPress={() => void onCreateManual()}
        style={[styles.manual, submitting && styles.submitDisabled]}
        accessibilityRole="button"
      >
        <Text style={styles.manualText}>写真なしで作成（手入力）</Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  container: { padding: 16, gap: 10 },
  label: { color: colors.w70, fontSize: 13, marginTop: 6 },
  seatRow: { flexDirection: "row", gap: 8 },
  seatBtn: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 14,
    backgroundColor: colors.chrome2,
  },
  seatActive: { backgroundColor: colors.accent, borderColor: colors.accent },
  seatActiveText: { color: "#16181d", fontWeight: "700" },
  pick: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
    borderRadius: 8,
    padding: 12,
    alignItems: "center",
    backgroundColor: colors.chrome,
  },
  pickText: { color: colors.accent },
  thumb: { width: 120, height: 90, borderRadius: 6 },
  thumbSmall: { width: 44, height: 44, borderRadius: 4 },
  handRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
    borderRadius: 8,
    padding: 10,
    backgroundColor: colors.chrome,
  },
  handLabel: { color: colors.w70 },
  error: { color: colors.vermilion, fontSize: 14 },
  submit: {
    backgroundColor: colors.accent,
    borderRadius: 8,
    padding: 14,
    alignItems: "center",
    marginTop: 8,
  },
  submitDisabled: { backgroundColor: colors.chrome3 },
  submitText: { color: "#16181d", fontSize: 15, fontWeight: "700" },
  manual: {
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 8,
    padding: 13,
    alignItems: "center",
    marginTop: 2,
  },
  manualText: { color: colors.accent, fontSize: 14, fontWeight: "700" },
});
