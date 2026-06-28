import type { Kifu, Seat } from "@rigel/schema";
import { seatLabel } from "@rigel/ui";
import { StyleSheet, Text, View } from "react-native";
import { Tile } from "./Tile";

const SEATS: Seat[] = ["east", "south", "west", "north"];

/** 牌譜の盤面を読み取り専用で表示（席ごとに手牌・鳴き・河）。 */
export function KifuBoardView({ kifu }: { kifu: Kifu }) {
  return (
    <View style={styles.container}>
      {SEATS.map((seat) => {
        const board = kifu.seats[seat];
        return (
          <View key={seat} style={styles.section}>
            <Text style={styles.seat}>{seatLabel(seat)}家</Text>

            {board.hand.length > 0 && (
              <>
                <Text style={styles.label}>手牌</Text>
                <View style={styles.row}>
                  {board.hand.map((t, i) => (
                    <Tile key={i} read={t} />
                  ))}
                </View>
              </>
            )}

            {board.melds.map((m, mi) => (
              <View key={mi}>
                <Text style={styles.label}>
                  鳴き（{m.type}
                  {m.from ? `←${seatLabel(m.from)}` : ""}）
                </Text>
                <View style={styles.row}>
                  {m.tiles.map((t, i) => (
                    <Tile key={i} read={t} />
                  ))}
                </View>
              </View>
            ))}

            <Text style={styles.label}>河</Text>
            <View style={styles.row}>
              {board.river.length === 0 ? (
                <Text style={styles.empty}>—</Text>
              ) : (
                board.river.map((d, i) => <Tile key={i} read={d} riichi={d.riichi} />)
              )}
            </View>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: 12 },
  section: { borderWidth: 1, borderColor: "#eee", borderRadius: 8, padding: 10 },
  seat: { fontWeight: "700", fontSize: 14, marginBottom: 4 },
  label: { color: "#888", fontSize: 12, marginTop: 4 },
  row: { flexDirection: "row", flexWrap: "wrap" },
  empty: { color: "#bbb" },
});
