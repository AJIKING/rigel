import type { ReadTile } from "@rigel/schema";
import { needsReview, REVIEW_COLOR, tileFace, tileLabel } from "@rigel/ui";
import { StyleSheet, Text, View } from "react-native";

const W = 30;
const H = 40;

/** 自前・簡易フェイスの牌（フォールバック / 予備）。既定は OSS 画像の Tile.tsx。 */
export function SimpleTile({ read, riichi = false }: { read: ReadTile; riichi?: boolean }) {
  const review = needsReview(read);
  const face = tileFace(read.tile);

  return (
    <View style={[styles.tile, review && styles.review]} accessibilityLabel={tileLabel(read.tile)}>
      {face.kind === "unknown" ? (
        <Text style={{ color: "#999", fontWeight: "700" }}>?</Text>
      ) : (
        <>
          {face.kind === "number" && (
            <Text style={{ color: face.color, fontWeight: "700", fontSize: 16 }}>{face.rank}</Text>
          )}
          <Text
            style={{
              color: face.color,
              fontWeight: "700",
              fontSize: face.kind === "honor" ? 15 : 10,
            }}
          >
            {face.glyph}
          </Text>
        </>
      )}
      {riichi && <View pointerEvents="none" style={styles.riichiBar} />}
    </View>
  );
}

const styles = StyleSheet.create({
  tile: {
    width: W,
    height: H,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: "#ccc",
    borderRadius: 4,
    margin: 2,
    backgroundColor: "#fff",
  },
  review: { borderColor: REVIEW_COLOR, backgroundColor: "#fff5f5" },
  riichiBar: {
    position: "absolute",
    left: 5,
    right: 5,
    bottom: 3,
    height: 2.5,
    backgroundColor: REVIEW_COLOR,
    borderRadius: 1,
  },
});
