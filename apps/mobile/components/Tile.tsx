import type { ReadTile } from "@rigel/schema";
import { needsReview, REVIEW_COLOR, tileAssetName, tileLabel } from "@rigel/ui";
import { Image, StyleSheet, Text, View } from "react-native";
import { TILE_FRONT, TILE_IMAGES } from "./tile-images";

const W = 30;
const H = 40;

/**
 * 1牌の表示（OSS 画像 = FluffyStuff/riichi-mahjong-tiles, CC0）。
 * Front の上にシンボル画像を重ねる。要確認は赤枠、リーチは下に赤帯。自前は SimpleTile.tsx（予備）。
 */
export function Tile({ read, riichi = false }: { read: ReadTile; riichi?: boolean }) {
  const review = needsReview(read);
  const symbol = read.tile ? TILE_IMAGES[tileAssetName(read.tile)] : undefined;

  return (
    <View style={styles.tile} accessibilityLabel={tileLabel(read.tile)}>
      <Image source={TILE_FRONT} style={styles.img} resizeMode="contain" />
      {symbol !== undefined ? (
        <Image source={symbol} style={[styles.img, styles.overlay]} resizeMode="contain" />
      ) : (
        <Text style={styles.unknown}>?</Text>
      )}
      {review && <View pointerEvents="none" style={styles.reviewBorder} />}
      {riichi && <View pointerEvents="none" style={styles.riichiBar} />}
    </View>
  );
}

const styles = StyleSheet.create({
  tile: { width: W, height: H, margin: 2 },
  img: { width: W, height: H },
  overlay: { position: "absolute", top: 0, left: 0 },
  unknown: {
    position: "absolute",
    top: 0,
    left: 0,
    width: W,
    height: H,
    textAlign: "center",
    lineHeight: H,
    color: "#999",
    fontWeight: "700",
  },
  reviewBorder: {
    position: "absolute",
    top: 0,
    left: 0,
    width: W,
    height: H,
    borderWidth: 2,
    borderColor: REVIEW_COLOR,
    borderRadius: 4,
  },
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
