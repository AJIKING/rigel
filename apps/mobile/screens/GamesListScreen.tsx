import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import {
  checkoutErrorMessage,
  planLabel,
  planMonthlyPrice,
  upgradeTargets,
  type PaidPlan,
  type Plan,
} from "@rigel/ui";
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

/** 上位プラン(Next/Pro)への Stripe Checkout をブラウザで開く。 */
function UpgradeBanner({ token, plan }: { token: string; plan: Plan }) {
  const [busy, setBusy] = useState<PaidPlan | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const targets = upgradeTargets(plan);
  if (targets.length === 0) return null;

  async function onUpgrade(target: PaidPlan) {
    setBusy(target);
    setNote(null);
    try {
      const result = await createCheckout(token, {
        plan: target,
        successUrl: "https://rigel.app/ok",
        cancelUrl: "https://rigel.app/ng",
      });
      if (result.ok) {
        await Linking.openURL(result.url);
        return;
      }
      setNote(checkoutErrorMessage(result.status));
    } catch {
      setNote("通信に失敗しました。");
    } finally {
      setBusy(null);
    }
  }

  return (
    <View style={styles.upgrade}>
      {targets.map((target) => (
        <Pressable key={target} disabled={busy !== null} onPress={() => void onUpgrade(target)}>
          <Text style={styles.upgradeText}>
            {busy === target ? "…" : `${planLabel(target)} ¥${planMonthlyPrice(target)} にする`}
          </Text>
        </Pressable>
      ))}
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
      {user && token ? <UpgradeBanner token={token} plan={user.plan} /> : null}
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
