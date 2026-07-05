import type { Seat } from "@rigel/schema";
import { windOf, SEAT_ORDER } from "@rigel/ui";
import { StyleSheet, Text, View } from "react-native";
import { colors, radius } from "../../lib/theme";

/**
 * 4席の点棒増減（デルタ）を横並びで表示する共有ストリップ。
 * 和了（AgariForm）と流局（DrawForm）の点数プレビューで共用する。
 * highlight を渡すと該当席のセルを強調する（例: 流局の聴牌者）。
 */
export function SeatDeltas({
  deltas,
  dealer,
  highlight,
}: {
  deltas: Record<Seat, number>;
  dealer: Seat;
  highlight?: (seat: Seat) => boolean;
}) {
  return (
    <View style={styles.row}>
      {SEAT_ORDER.map((seat) => {
        const v = deltas[seat] ?? 0;
        return (
          <View key={seat} style={[styles.cell, highlight?.(seat) && styles.cellOn]}>
            <Text style={styles.name}>{windOf(seat, dealer)}家</Text>
            <Text style={[styles.val, v > 0 ? styles.plus : v < 0 ? styles.minus : styles.zero]}>
              {v > 0 ? "+" : ""}
              {v.toLocaleString()}
            </Text>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", gap: 6, marginTop: 8 },
  cell: {
    flex: 1,
    backgroundColor: colors.chrome2,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
    borderRadius: radius.sm,
    paddingVertical: 8,
    alignItems: "center",
  },
  cellOn: { borderColor: colors.accent },
  name: { color: colors.w45, fontSize: 10, marginBottom: 3 },
  val: { fontWeight: "800", fontSize: 12.5 },
  plus: { color: colors.emLite },
  minus: { color: colors.vermilion },
  zero: { color: colors.w45 },
});
