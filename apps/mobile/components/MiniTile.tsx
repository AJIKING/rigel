import type { Tile as TileCode } from "@rigel/schema";
import { tileAssetName, tileLabel } from "@rigel/ui";
import { Image, StyleSheet, Text, View, type ViewStyle } from "react-native";
import { colors } from "../lib/theme";
import { TILE_FRONT, TILE_IMAGES } from "./tile-images";

/**
 * 1牌の表示（OSS 画像 = FluffyStuff/riichi-mahjong-tiles, CC0）。回転卓・和了手で共通に使う。
 * Front の上にシンボル画像を重ねる。サイズは w/h 指定（盤面サイズ比から算出）。
 * back=裏向き（象牙の裏）、riichi=横向き、tsumogiri=薄く。読めない牌は Front に「?」。
 */
export function MiniTile({
  code,
  w,
  h,
  back = false,
  riichi = false,
  tsumogiri = false,
}: {
  code?: TileCode | null;
  w: number;
  h: number;
  back?: boolean;
  riichi?: boolean;
  tsumogiri?: boolean;
}) {
  const box: ViewStyle = {
    width: w,
    height: h,
    borderRadius: Math.max(1, w * 0.1),
    transform: riichi ? [{ rotate: "90deg" }] : undefined,
    opacity: tsumogiri ? 0.72 : 1,
  };

  if (back) {
    return <View style={[styles.back, box]} />;
  }

  const symbol = code ? TILE_IMAGES[tileAssetName(code)] : undefined;
  return (
    <View style={[styles.tile, box]} accessibilityLabel={tileLabel(code ?? null)}>
      <Image source={TILE_FRONT} style={styles.img} resizeMode="contain" />
      {symbol !== undefined ? (
        <Image source={symbol} style={[styles.img, styles.overlay]} resizeMode="contain" />
      ) : (
        <Text style={[styles.unknown, { fontSize: h * 0.5, lineHeight: h }]}>?</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  tile: { backgroundColor: colors.bone, overflow: "hidden" },
  img: { width: "100%", height: "100%" },
  overlay: { position: "absolute", top: 0, left: 0 },
  back: {
    backgroundColor: colors.bone,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.boneEdge,
  },
  unknown: {
    position: "absolute",
    top: 0,
    left: 0,
    width: "100%",
    height: "100%",
    textAlign: "center",
    color: colors.w45,
    fontWeight: "700",
  },
});
