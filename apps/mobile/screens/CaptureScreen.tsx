import { useNavigation, useRoute, type RouteProp } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { SeatSchema, type Seat } from "@rigel/schema";
import {
  analyzeErrorMessage,
  cameraLabel,
  planCanAnalyze,
  roundNameForSeq,
  seatLabel,
  LIMIT_MESSAGES,
} from "@rigel/ui";
import { useState } from "react";
import { Image, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { RoundPicker } from "../components/RoundPicker";
import { analyze, createEmptyKifu, createGame } from "../lib/api";
import { useAuth } from "../lib/auth";
import type { RootStackParamList } from "../lib/navigation";
import { pickImage, type PickedImage as Picked } from "../lib/pick-image";
import { colors } from "../lib/theme";

type Nav = NativeStackNavigationProp<RootStackParamList, "Capture">;

const CAMS = ["bottom", "right", "top", "left"] as const;

export function CaptureScreen() {
  const nav = useNavigation<Nav>();
  // gameId があれば既存半荘への局追加（半荘詳細の「＋局を追加」から来る）。
  const gameId = useRoute<RouteProp<RootStackParamList, "Capture">>().params?.gameId;
  const { token, user } = useAuth();
  // 写真からのAI再現は有料プランのみ（free は解析枠0）。フリーには写真入力を出さない。
  const canAnalyze = planCanAnalyze(user?.plan ?? "free");
  const [seat, setSeat] = useState<Seat>("east");
  // 作成する局（東一局=1〜北四局=16）。半荘内の好きな局を1つだけ作れる。
  const [seq, setSeq] = useState(1);
  const [river, setRiver] = useState<Picked | null>(null);
  const [hands, setHands] = useState<Partial<Record<(typeof CAMS)[number], Picked>>>({});
  const [submitting, setSubmitting] = useState(false);
  const [creating, setCreating] = useState(false); // 手入力作成。解析(submitting)とは独立。
  const [error, setError] = useState<string | null>(null);
  const busy = submitting || creating;

  /** 写真なしの手入力作成。既存半荘には局を足し、無ければ新しい半荘を作って編集画面へ。 */
  async function onCreateManual() {
    if (!token) {
      setError("ログインが必要です。");
      return;
    }
    setError(null);
    setCreating(true);
    try {
      // 手入力の手前席は東固定（席は編集画面で自由に触れるため選択は不要）。
      const res = gameId
        ? await createEmptyKifu(token, gameId, "east", undefined, seq)
        : await createGame(token, "east", undefined, seq);
      if (res.ok) nav.navigate("Edit", { gameId: res.gameId, logId: res.logId });
      else if (res.status === 409) setError(LIMIT_MESSAGES.gameFull);
      else if (res.status === 403) setError(LIMIT_MESSAGES.draftGames);
      else setError("作成に失敗しました。");
    } catch {
      setError("通信に失敗しました。");
    } finally {
      setCreating(false);
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
      if (gameId) form.append("gameId", gameId); // 既存半荘への局追加
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
      {gameId ? (
        <Text style={styles.addNote}>
          この半荘に局を追加します{canAnalyze ? "（写真解析 または 手入力）" : "（手入力）"}。
        </Text>
      ) : null}
      {/* 作成する局（半荘内の好きな局を1つだけ作れる）。 */}
      <Text style={styles.label}>作成する局（{roundNameForSeq(seq)}）</Text>
      <RoundPicker value={seq} onChange={setSeq} />

      {/* 写真からのAI再現は有料プランのみ（free は枠0）。フリーには写真入力を出さない。 */}
      {canAnalyze ? (
        <>
          {/* 席は写真の向き（相対→絶対変換）にだけ必要。手入力は東固定で選択不要。 */}
          <Text style={styles.label}>撮影時に手前だった席</Text>
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
        </>
      ) : null}

      {error ? <Text style={styles.error}>{error}</Text> : null}

      {canAnalyze ? (
        <>
          <Pressable
            disabled={busy || !river}
            onPress={() => void onSubmit()}
            style={[styles.submit, (busy || !river) && styles.submitDisabled]}
            accessibilityRole="button"
          >
            <Text style={styles.submitText}>
              {submitting ? "解析中…（少し時間がかかります）" : "解析して保存"}
            </Text>
          </Pressable>

          {/* 解析とは別導線。区切りを置いて誤タップ・状態の取り違えを防ぐ。 */}
          <View style={styles.orRow}>
            <View style={styles.orLine} />
            <Text style={styles.orText}>または</Text>
            <View style={styles.orLine} />
          </View>
        </>
      ) : null}

      {/* 写真なしの手入力作成（空の初局を作って編集画面へ）。フリーはこれが主ボタン。 */}
      <Pressable
        disabled={busy}
        onPress={() => void onCreateManual()}
        style={[canAnalyze ? styles.manual : styles.submit, busy && styles.submitDisabled]}
        accessibilityRole="button"
      >
        <Text style={canAnalyze ? styles.manualText : styles.submitText}>
          {creating ? "作成中…" : "手入力で作成"}
        </Text>
      </Pressable>

      {!canAnalyze ? (
        <Text style={styles.upsell}>
          写真からのAI再現（撮影→自動で牌譜化）は有料プラン（Next / Pro）で利用できます。
        </Text>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  container: { padding: 16, gap: 10 },
  addNote: { color: colors.accent, fontSize: 12.5, fontWeight: "700" },
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
  submitDisabled: { backgroundColor: colors.chrome3, opacity: 0.6 },
  submitText: { color: "#16181d", fontSize: 15, fontWeight: "700" },
  orRow: { flexDirection: "row", alignItems: "center", gap: 10, marginVertical: 8 },
  orLine: { flex: 1, height: StyleSheet.hairlineWidth, backgroundColor: colors.line },
  orText: { color: colors.w45, fontSize: 11, fontWeight: "700" },
  manual: {
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 8,
    padding: 13,
    alignItems: "center",
  },
  manualText: { color: colors.accent, fontSize: 14, fontWeight: "700" },
  upsell: { color: colors.w45, fontSize: 12, lineHeight: 17, marginTop: 6 },
});
