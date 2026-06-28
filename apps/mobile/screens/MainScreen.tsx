import type { ReadTile } from "@rigel/schema";
import { seatLabel } from "@rigel/ui";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Tile } from "../components/Tile";
import { useAuth } from "../lib/auth";

const sampleRiver: ReadTile[] = [
  { tile: "1m", confidence: 0.99 },
  { tile: "0p", confidence: 0.9 },
  { tile: "3s", confidence: 0.4 },
  { tile: null, confidence: 0 },
];

export function MainScreen() {
  const { user, signOut } = useAuth();

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>rigel — 麻雀牌譜</Text>
        <Pressable onPress={signOut} accessibilityRole="button" style={styles.logout}>
          <Text style={styles.logoutText}>ログアウト</Text>
        </Pressable>
      </View>

      <Text style={styles.plan}>ログイン中（{user?.plan === "paid" ? "有料" : "無料"}）</Text>

      <View style={styles.body}>
        <Text style={styles.sub}>{seatLabel("east")}家の河（例）</Text>
        <View style={styles.row}>
          {sampleRiver.map((read, i) => (
            <Tile key={i} read={read} />
          ))}
        </View>
        <Text style={styles.note}>赤枠は要確認（confidence 低 / 読めない牌）</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, paddingTop: 56, paddingHorizontal: 16 },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  title: { fontSize: 18, fontWeight: "bold" },
  logout: {
    borderWidth: 1,
    borderColor: "#ccc",
    borderRadius: 6,
    paddingVertical: 4,
    paddingHorizontal: 10,
  },
  logoutText: { fontSize: 13, color: "#333" },
  plan: { color: "#666", marginTop: 4 },
  body: { flex: 1, alignItems: "center", justifyContent: "center", gap: 10 },
  sub: { color: "#666" },
  row: { flexDirection: "row", flexWrap: "wrap", justifyContent: "center" },
  note: { color: "#999", fontSize: 12 },
});
