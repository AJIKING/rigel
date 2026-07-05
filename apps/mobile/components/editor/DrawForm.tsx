import type { Seat } from "@rigel/schema";
import { notenDeltas, windOf, SEAT_ORDER } from "@rigel/ui";
import { StyleSheet, Text, View } from "react-native";
import { colors } from "../../lib/theme";
import { Chip } from "../Chip";
import { SeatDeltas } from "./SeatDeltas";

/**
 * 流局フォーム。各席の聴牌/不聴を選び、不聴罰符（計3000点）の受け渡しをプレビューする。
 * 点数は牌姿から出せないため聴牌者だけ記録し、罰符は席数から算出（notenDeltas）。
 */
export function DrawForm({
  tenpai,
  dealer,
  onChange,
}: {
  tenpai: Seat[];
  dealer: Seat;
  onChange: (tenpai: Seat[]) => void;
}) {
  const set = new Set(tenpai);
  const deltas = notenDeltas(tenpai);

  return (
    <View style={styles.wrap}>
      <Text style={styles.hint}>聴牌者を選ぶと不聴罰符（計3000点）の受け渡しが出ます。</Text>
      <View style={styles.row}>
        {SEAT_ORDER.map((seat) => (
          <Chip
            key={seat}
            label={`${windOf(seat, dealer)}家 ${set.has(seat) ? "聴牌" : "不聴"}`}
            on={set.has(seat)}
            onPress={() =>
              onChange(set.has(seat) ? tenpai.filter((s) => s !== seat) : [...tenpai, seat])
            }
          />
        ))}
      </View>

      <SeatDeltas deltas={deltas} dealer={dealer} highlight={(seat) => set.has(seat)} />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 10, marginTop: 8 },
  hint: { color: colors.w45, fontSize: 11 },
  row: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
});
