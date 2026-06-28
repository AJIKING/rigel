import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { SeatSchema, type Seat } from "@rigel/schema";
import { analyzeErrorMessage, cameraLabel, seatLabel } from "@rigel/ui";
import * as ImagePicker from "expo-image-picker";
import { useState } from "react";
import { Image, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { analyze } from "../lib/api";
import { useAuth } from "../lib/auth";
import type { RootStackParamList } from "../lib/navigation";

type Nav = NativeStackNavigationProp<RootStackParamList, "Capture">;

const CAMS = ["bottom", "right", "top", "left"] as const;

interface Picked {
  uri: string;
  name: string;
  type: string;
}

async function pickImage(): Promise<Picked | null> {
  const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!perm.granted) return null;
  const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], quality: 0.8 });
  const asset = res.canceled ? null : res.assets[0];
  if (!asset) return null;
  return {
    uri: asset.uri,
    name: asset.fileName ?? "photo.jpg",
    type: asset.mimeType ?? "image/jpeg",
  };
}

export function CaptureScreen() {
  const nav = useNavigation<Nav>();
  const { token } = useAuth();
  const [seat, setSeat] = useState<Seat>("east");
  const [river, setRiver] = useState<Picked | null>(null);
  const [hands, setHands] = useState<Partial<Record<(typeof CAMS)[number], Picked>>>({});
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
    <ScrollView contentContainerStyle={styles.container}>
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
      <Pressable style={styles.pick} onPress={() => void pickImage().then((p) => p && setRiver(p))}>
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
          onPress={() => void pickImage().then((p) => p && setHands((h) => ({ ...h, [cam]: p })))}
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
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 16, gap: 10 },
  label: { color: "#555", fontSize: 13, marginTop: 6 },
  seatRow: { flexDirection: "row", gap: 8 },
  seatBtn: {
    borderWidth: 1,
    borderColor: "#ccc",
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 14,
  },
  seatActive: { backgroundColor: "#222", borderColor: "#222" },
  seatActiveText: { color: "#fff" },
  pick: { borderWidth: 1, borderColor: "#ccc", borderRadius: 8, padding: 12, alignItems: "center" },
  pickText: { color: "#0b5cad" },
  thumb: { width: 120, height: 90, borderRadius: 6 },
  thumbSmall: { width: 44, height: 44, borderRadius: 4 },
  handRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderWidth: 1,
    borderColor: "#eee",
    borderRadius: 8,
    padding: 10,
  },
  handLabel: { color: "#555" },
  error: { color: "crimson", fontSize: 14 },
  submit: {
    backgroundColor: "#222",
    borderRadius: 8,
    padding: 14,
    alignItems: "center",
    marginTop: 8,
  },
  submitDisabled: { backgroundColor: "#999" },
  submitText: { color: "#fff", fontSize: 15, fontWeight: "600" },
});
