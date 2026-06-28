import type { ReadTile } from "@rigel/schema";
import { describeTile, needsReview, tileLabel } from "@rigel/ui";
import { StyleSheet, Text, View } from "react-native";

/** 1牌の表示（RN）。確信度が低い/読めない牌は赤枠で「要確認」を示す。 */
export function Tile({ read }: { read: ReadTile }) {
  const review = needsReview(read);
  const info = describeTile(read.tile);
  return (
    <View style={[styles.tile, review && styles.review]}>
      <Text style={{ color: info?.red ? "#d00" : "#222", fontWeight: "600" }}>
        {tileLabel(read.tile)}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  tile: {
    minWidth: 30,
    height: 38,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: "#ccc",
    borderRadius: 4,
    margin: 2,
    paddingHorizontal: 4,
    backgroundColor: "#fff",
  },
  review: {
    borderColor: "crimson",
    backgroundColor: "#fff5f5",
  },
});
