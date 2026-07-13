import type { Tile as TileCode } from "@rigel/schema";
import { tileAssetName, tileLabel } from "@rigel/ui";
import { Image, StyleSheet, Text, View, type ViewStyle } from "react-native";
import { colors } from "../lib/theme";
import { TILE_FRONT, TILE_IMAGES } from "./tile-images";

// 牌を少し浮かせる立体感（web の box-shadow 近似。RN は gradient/inset 影が無いので影のみ）。
const RAISED = {
  shadowColor: "#000",
  shadowOpacity: 0.28,
  shadowRadius: 2,
  shadowOffset: { width: 0, height: 1 },
  elevation: 2,
} as const;

/**
 * 1牌の表示（OSS 画像 = FluffyStuff/riichi-mahjong-tiles, CC0）。回転卓・和了手で共通に使う。
 * Front の上にシンボル画像を重ねる。サイズは w/h 指定（盤面サイズ比から算出）。
 * back=裏向き（緑の伏せ牌）、riichi=横向き、tsumogiri=グレーがけ、読めない牌は Front に「?」。
 * highlight=注目牌の強調枠（何切るの鳴き判断で対象牌に付ける。web の強調と同じ意図）。
 */
export function MiniTile({
  code,
  w,
  h,
  back = false,
  riichi = false,
  tsumogiri = false,
  highlight = false,
  called = false,
}: {
  code?: TileCode | null;
  w: number;
  h: number;
  back?: boolean;
  riichi?: boolean;
  tsumogiri?: boolean;
  highlight?: boolean;
  /** 鳴かれた捨て牌（他家の鳴きへ移った牌）。河で薄表示にする（web と同じ 0.38）。 */
  called?: boolean;
}) {
  const box: ViewStyle = {
    width: w,
    height: h,
    borderRadius: Math.max(1, w * 0.1),
    transform: riichi ? [{ rotate: "90deg" }] : undefined,
    opacity: called ? 0.38 : undefined,
  };

  if (back) {
    // 裏向き（伏せ牌）: 緑地＋内枠（web の .tile.back を近似）。
    return (
      <View style={[styles.back, box]}>
        <View
          style={[
            styles.backInner,
            { top: h * 0.18, bottom: h * 0.18, left: w * 0.26, right: w * 0.26 },
          ]}
        />
      </View>
    );
  }

  const symbol = code ? TILE_IMAGES[tileAssetName(code)] : undefined;
  return (
    <View
      style={[styles.tile, box, highlight && styles.hl]}
      accessibilityLabel={tileLabel(code ?? null)}
    >
      <Image source={TILE_FRONT} style={styles.img} resizeMode="contain" />
      {symbol !== undefined ? (
        <Image source={symbol} style={[styles.img, styles.overlay]} resizeMode="contain" />
      ) : (
        <Text style={[styles.unknown, { fontSize: h * 0.5, lineHeight: h }]}>?</Text>
      )}
      {/* ツモ切りは色を抜いて手出しと一目で区別（web の grayscale 近似）。 */}
      {tsumogiri ? <View style={styles.scrim} pointerEvents="none" /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  tile: { backgroundColor: colors.bone, overflow: "hidden", ...RAISED },
  // 注目牌の強調枠（鳴き判断の対象牌など）。
  hl: { borderWidth: 2, borderColor: colors.accent },
  img: { width: "100%", height: "100%" },
  overlay: { position: "absolute", top: 0, left: 0 },
  scrim: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(86,90,88,0.42)" },
  back: {
    backgroundColor: colors.em,
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
    ...RAISED,
  },
  backInner: {
    position: "absolute",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(255,255,255,0.22)",
    borderRadius: 1,
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
