import { TILE_VALUES, type ReadTile } from "@rigel/schema";
import { needsReview } from "@rigel/ui";
import { StatusBar } from "expo-status-bar";
import { StyleSheet, Text, View } from "react-native";

// 共有パッケージのデモ:
//  - 背骨スキーマ(@rigel/schema)の牌種を参照
//  - confidence の低い/読めなかった牌は @rigel/ui の判定で「要確認」表示
const sampleReads: ReadTile[] = [
  { tile: "1m", confidence: 0.99 },
  { tile: "5p", confidence: 0.4 },
  { tile: null, confidence: 0 },
];

export default function App() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>rigel — 麻雀牌譜</Text>
      <Text>背骨スキーマの牌種数: {TILE_VALUES.length}</Text>
      {sampleReads.map((read, i) => {
        const review = needsReview(read);
        return (
          <Text key={i} style={review ? styles.review : undefined}>
            {read.tile ?? "??"}（confidence {read.confidence}）{review ? " ← 要確認" : ""}
          </Text>
        );
      })}
      <StatusBar style="auto" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  title: {
    fontSize: 20,
    fontWeight: "bold",
  },
  review: {
    color: "crimson",
  },
});
