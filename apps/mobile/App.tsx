import type { ReadTile } from "@rigel/schema";
import { seatLabel } from "@rigel/ui";
import { StatusBar } from "expo-status-bar";
import { StyleSheet, Text, View } from "react-native";
import { Tile } from "./components/Tile";

// 共有パッケージ(@rigel/schema, @rigel/ui)を使う最小画面。
const sampleRiver: ReadTile[] = [
  { tile: "1m", confidence: 0.99 },
  { tile: "0p", confidence: 0.9 },
  { tile: "3s", confidence: 0.4 },
  { tile: null, confidence: 0 },
];

export default function App() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>rigel — 麻雀牌譜</Text>
      <Text style={styles.sub}>{seatLabel("east")}家の河（例）</Text>
      <View style={styles.row}>
        {sampleRiver.map((read, i) => (
          <Tile key={i} read={read} />
        ))}
      </View>
      <Text style={styles.note}>赤枠は要確認（confidence 低 / 読めない牌）</Text>
      <StatusBar style="auto" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    padding: 16,
  },
  title: { fontSize: 20, fontWeight: "bold" },
  sub: { color: "#666" },
  row: { flexDirection: "row", flexWrap: "wrap", justifyContent: "center" },
  note: { color: "#999", fontSize: 12 },
});
