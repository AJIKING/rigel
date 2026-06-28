import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Linking,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { createCheckout } from "../lib/api";
import { useAuth } from "../lib/auth";
import { fmtDate } from "../lib/format";
import type { RootStackParamList } from "../lib/navigation";
import { useGames } from "../lib/use-kifu-data";

type Nav = NativeStackNavigationProp<RootStackParamList, "GamesList">;

/** 無料ユーザー向け: Stripe Checkout をブラウザで開いてアップグレードする。 */
function UpgradeBanner({ token }: { token: string }) {
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  async function onUpgrade() {
    setBusy(true);
    setNote(null);
    try {
      const result = await createCheckout(token, {
        successUrl: "https://rigel.app/ok",
        cancelUrl: "https://rigel.app/ng",
      });
      if (result.ok) {
        await Linking.openURL(result.url);
        return;
      }
      setNote(result.status === 501 ? "課金は準備中です。" : "開始できませんでした。");
    } catch {
      setNote("通信に失敗しました。");
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={styles.upgrade}>
      <Pressable disabled={busy} onPress={() => void onUpgrade()}>
        <Text style={styles.upgradeText}>{busy ? "…" : "有料プランにアップグレード"}</Text>
      </Pressable>
      {note ? <Text style={styles.upgradeNote}>{note}</Text> : null}
    </View>
  );
}

export function GamesListScreen() {
  const nav = useNavigation<Nav>();
  const { user, token } = useAuth();
  const { loading, games, sample, error } = useGames();

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator />
      </View>
    );
  }
  if (error) {
    return (
      <View style={styles.center}>
        <Text style={styles.error}>{error}</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Pressable style={styles.capture} onPress={() => nav.navigate("Capture")}>
        <Text style={styles.captureText}>＋ 牌譜を撮る</Text>
      </Pressable>
      {user?.plan === "free" && token ? <UpgradeBanner token={token} /> : null}
      {sample && <Text style={styles.sample}>サンプル表示中（ログインで自分の半荘が出ます）</Text>}
      {games.length === 0 ? (
        <Text style={styles.empty}>まだ半荘がありません。卓を撮影して記録してください。</Text>
      ) : (
        <FlatList
          data={games}
          keyExtractor={(g) => g.id}
          contentContainerStyle={{ gap: 10, padding: 12 }}
          renderItem={({ item }) => (
            <Pressable
              style={styles.card}
              onPress={() => nav.navigate("GameDetail", { gameId: item.id })}
            >
              <Text style={styles.title}>{item.title || "（無題の半荘）"}</Text>
              <Text style={styles.date}>{fmtDate(item.createdAt)}</Text>
            </Pressable>
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  sample: { color: "#a60", fontSize: 12, padding: 12, paddingBottom: 0 },
  empty: { color: "#888", padding: 16 },
  error: { color: "crimson" },
  card: { borderWidth: 1, borderColor: "#eee", borderRadius: 10, padding: 14 },
  title: { fontWeight: "700", fontSize: 15 },
  date: { color: "#999", fontSize: 12, marginTop: 2 },
  capture: {
    backgroundColor: "#222",
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: "center",
    margin: 12,
    marginBottom: 0,
  },
  captureText: { color: "#fff", fontWeight: "600" },
  upgrade: {
    backgroundColor: "#fdf6e3",
    borderColor: "#e6d28a",
    borderWidth: 1,
    borderRadius: 8,
    padding: 12,
    marginHorizontal: 12,
    marginTop: 10,
    alignItems: "center",
  },
  upgradeText: { color: "#8a6d00", fontWeight: "700" },
  upgradeNote: { color: "#a60", fontSize: 12, marginTop: 4 },
});
