import { StyleSheet, View, type ViewStyle } from "react-native";
import { StarMark } from "./BrandMark";
import { colors, radius } from "../lib/theme";

/**
 * 麻雀牌をあしらったブランドチップ（ログインの大チップ / 一覧サムネイル共通）。
 * 緑のタイルに骨色の4枚牌と中央マーク（星 or ドット）を配置する。
 */
export function TileChip({
  size = 64,
  center = "dot",
}: {
  size?: number;
  center?: "star" | "dot";
}) {
  const vW = size * 0.135;
  const vH = size * 0.183;
  const inset = size * 0.17;
  const dot = size * 0.094;

  const tile: ViewStyle = {
    position: "absolute",
    backgroundColor: colors.bone,
    borderRadius: size * 0.02,
  };

  return (
    <View
      style={[
        styles.chip,
        {
          width: size,
          height: size,
          borderRadius: center === "star" ? radius.card : radius.base,
        },
      ]}
    >
      {/* 上 */}
      <View style={[tile, { width: vW, height: vH, top: inset, left: (size - vW) / 2 }]} />
      {/* 下 */}
      <View style={[tile, { width: vW, height: vH, bottom: inset, left: (size - vW) / 2 }]} />
      {/* 左 */}
      <View style={[tile, { width: vH, height: vW, left: inset, top: (size - vW) / 2 }]} />
      {/* 右 */}
      <View style={[tile, { width: vH, height: vW, right: inset, top: (size - vW) / 2 }]} />
      {/* 中央 */}
      {center === "star" ? (
        <StarMark size={size * 0.21} />
      ) : (
        <View
          style={{ width: dot, height: dot, borderRadius: dot / 2, backgroundColor: colors.accent }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  chip: {
    backgroundColor: colors.emDeep,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
});
