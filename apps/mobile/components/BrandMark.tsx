import { StyleSheet, Text, View, type StyleProp, type TextStyle } from "react-native";
import Svg, { Path } from "react-native-svg";
import { colors } from "../lib/theme";

/** オレンジ5角星マーク（docs のロゴ意匠）。 */
export function StarMark({ size = 24, color = colors.accent }: { size?: number; color?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path
        d="M12 1.6l2.7 6.9 7.4.4-5.8 4.6 2 7.1L12 16.9 5.7 20.6l2-7.1L1.9 8.9l7.4-.4z"
        fill={color}
      />
    </Svg>
  );
}

/** ブランド表示（星 + ワードマーク "RAISHA"）。字間・寸法は呼び出し側から与える。 */
export function BrandMark({
  size = 24,
  fontSize = 15,
  letterSpacing = 3.3,
  wordmarkStyle,
}: {
  size?: number;
  fontSize?: number;
  letterSpacing?: number;
  wordmarkStyle?: StyleProp<TextStyle>;
}) {
  return (
    <View style={[styles.row, { gap: size * 0.4 }]}>
      <StarMark size={size} />
      <Text style={[styles.wm, { fontSize, letterSpacing }, wordmarkStyle]}>RAISHA</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center" },
  wm: { color: colors.white, fontWeight: "800" },
});
