import type { Tile as TileCode } from "@rigel/schema";
import { tileFace } from "@rigel/ui";
import { StyleSheet, Text, View, type ViewStyle } from "react-native";
import { colors } from "../lib/theme";

/**
 * コンパクトな牌フェイス（回転卓の河・手牌用）。OSS 画像ではなくグリフ描画で軽量に。
 * 数牌は「数字＋スート記号」、字牌はグリフ中央、裏向きは緑背。
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
  const box: ViewStyle = { width: w, height: h, borderRadius: Math.max(1, w * 0.1) };

  if (back) {
    return <View style={[styles.tile, styles.back, box]} />;
  }

  const face = tileFace(code ?? null);
  const num = face.kind === "number" ? String(face.red ? 5 : face.rank) : null;
  const fontSize = h * 0.46;

  return (
    <View style={[styles.tile, box, tsumogiri && styles.tsumogiri, riichi && styles.riichi]}>
      {face.kind === "unknown" ? (
        <Text style={[styles.glyph, { color: colors.w45, fontSize }]}>?</Text>
      ) : face.kind === "honor" ? (
        <Text style={[styles.glyph, { color: face.color, fontSize: h * 0.5 }]}>{face.glyph}</Text>
      ) : (
        <>
          <Text style={[styles.num, { color: face.color, fontSize: fontSize * 1.02 }]}>{num}</Text>
          <Text style={[styles.suit, { color: face.color, fontSize: fontSize * 0.62 }]}>
            {face.glyph}
          </Text>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  tile: {
    backgroundColor: colors.bone,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  back: { backgroundColor: colors.emLite },
  tsumogiri: { opacity: 0.72 },
  riichi: { transform: [{ rotate: "90deg" }] },
  glyph: { fontWeight: "800", includeFontPadding: false },
  num: { fontWeight: "800", includeFontPadding: false },
  suit: { fontWeight: "800", includeFontPadding: false, marginTop: -2 },
});
