import { totalHan, type Agari, type Kifu, type Seat } from "@rigel/schema";
import { kyokuDeltas, scoreAgari, sortHandTiles, windOf, SEAT_ORDER } from "@rigel/ui";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { colors, radius } from "../lib/theme";
import { BottomSheet, SheetCloseButton } from "./BottomSheet";
import { MiniTile } from "./MiniTile";

/** 和了演出シート（和了牌・役・打点・点数増減）。点数の絶対値は記録しないため増減のみ表示。 */
export function AgariSheet({
  kifu,
  dealer,
  ownerName,
  onClose,
}: {
  kifu: Kifu;
  dealer: Seat;
  ownerName?: string | null;
  onClose: () => void;
}) {
  const deltas = kyokuDeltas(kifu);

  return (
    <BottomSheet onClose={onClose} grabber={false}>
      <ScrollView>
        {kifu.agari.map((agari, i) => (
          <WinBlock key={i} agari={agari} kifu={kifu} dealer={dealer} />
        ))}

        <View style={styles.deltas}>
          {SEAT_ORDER.map((seat) => {
            const v = deltas[seat] ?? 0;
            const isWin = kifu.agari.some((a) => a.winner === seat);
            const wind = windOf(seat, dealer);
            const isBottom = seat === kifu.cameraBottomSeat;
            const label = isBottom ? ownerName || `${wind}家` : `${wind}家`;
            const cls = v > 0 ? styles.plus : v < 0 ? styles.minus : styles.zero;
            return (
              <View key={seat} style={[styles.dc, isWin && styles.dcWin]}>
                <Text style={styles.dn} numberOfLines={1}>
                  {label}
                </Text>
                <Text style={[styles.dv, cls]}>
                  {v > 0 ? "+" : ""}
                  {v.toLocaleString()}
                </Text>
              </View>
            );
          })}
        </View>

        <SheetCloseButton onPress={onClose} />
      </ScrollView>
    </BottomSheet>
  );
}

function WinBlock({ agari, kifu, dealer }: { agari: Agari; kifu: Kifu; dealer: Seat }) {
  const score = scoreAgari(agari, kifu.meta.dealer, kifu.rules);
  const han = totalHan(agari);
  const winnerRiichi = agari.riichi.includes(agari.winner);
  // 手牌すべてを見せる（理牌＋副露＋白枠の和了牌。web の AgariOverlay と同一構成）。
  // viewKifu の手牌はツモ和了牌が除去済み・ロン牌は元々含まれない。
  const board = kifu.seats[agari.winner];
  const handShown = sortHandTiles(board.hand);

  return (
    <View style={styles.win}>
      <View style={styles.head}>
        <Text style={styles.kind}>{agari.from === null ? "ツモ" : "ロン"}</Text>
        <Text style={styles.winner}>{windOf(agari.winner, dealer)}家</Text>
        <Text style={styles.meta}>
          {han}飜 {agari.fu}符
        </Text>
      </View>

      <View style={styles.hand}>
        {handShown.map((h, i) => (
          <MiniTile key={i} code={h.tile} w={24} h={34} />
        ))}
        {board.melds.map((m, mi) => (
          <View key={`m${mi}`} style={styles.meld}>
            {m.tiles.map((t, ti) => (
              <MiniTile key={ti} code={t.tile} w={24} h={34} />
            ))}
          </View>
        ))}
        {agari.winTile ? (
          <View style={styles.winTile} testID="agari-win-tile">
            <MiniTile code={agari.winTile} w={24} h={34} />
          </View>
        ) : null}
      </View>

      {/* ドラ表示牌・裏ドラ表示牌（裏はリーチ和了時のみ意味を持つ）。web の AgariOverlay と同一構成。 */}
      {(kifu.meta.dora.length > 0 || (winnerRiichi && kifu.meta.uraDora.length > 0)) && (
        <View style={styles.doraTiles}>
          {kifu.meta.dora.length > 0 && (
            <View style={styles.doraWrap} testID="agari-dora">
              <Text style={styles.doraLbl}>ドラ表示</Text>
              <View style={styles.doraRow}>
                {kifu.meta.dora.map((t, i) => (
                  <MiniTile key={`${t}-${i}`} code={t} w={22} h={31} />
                ))}
              </View>
            </View>
          )}
          {winnerRiichi && kifu.meta.uraDora.length > 0 && (
            <View style={styles.doraWrap} testID="agari-ura">
              <Text style={styles.doraLbl}>裏ドラ表示</Text>
              <View style={styles.doraRow}>
                {kifu.meta.uraDora.map((t, i) => (
                  <MiniTile key={`${t}-${i}`} code={t} w={22} h={31} />
                ))}
              </View>
            </View>
          )}
        </View>
      )}

      {agari.yaku.length > 0 ? (
        <View style={styles.yaku}>
          {agari.yaku.map((y) => (
            <View key={y.name} style={styles.yrow}>
              <Text style={styles.yname}>{y.name}</Text>
              <Text style={styles.yhan}>{y.han}飜</Text>
            </View>
          ))}
          <View style={styles.yrow}>
            <Text style={styles.ynameDim}>ドラ / 赤 / 裏</Text>
            <Text style={styles.ynameDim}>
              {agari.dora} / {agari.aka} / {agari.ura}
            </Text>
          </View>
        </View>
      ) : null}

      <View style={styles.total}>
        <Text style={styles.totalLabel}>
          {han}飜 {agari.fu}符
        </Text>
        <Text style={styles.totalScore}>
          {score.total.toLocaleString()}点{score.limit ? ` ${score.limit}` : ""}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  win: { marginBottom: 12 },
  head: { flexDirection: "row", alignItems: "center", gap: 9, marginBottom: 12 },
  kind: {
    fontWeight: "800",
    fontSize: 12.5,
    color: colors.accent,
    backgroundColor: colors.accentSoft,
    borderWidth: 1,
    borderColor: colors.accent,
    borderRadius: radius.sm,
    paddingHorizontal: 10,
    paddingVertical: 4,
    overflow: "hidden",
  },
  winner: { fontWeight: "800", fontSize: 18, color: colors.white },
  meta: { marginLeft: "auto", fontSize: 11, color: colors.w45, textAlign: "right" },
  hand: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 2,
    justifyContent: "center",
    padding: 12,
    backgroundColor: "#0c1c16",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
    borderRadius: radius.sm,
    marginBottom: 14,
  },
  meld: { flexDirection: "row", gap: 2, marginLeft: 8 },
  // 和了牌は白枠で強調（どれが和了牌か一目で分かるように）。
  winTile: { marginLeft: 8, borderWidth: 2, borderColor: colors.white, borderRadius: 3 },
  // ドラ表示・裏ドラ表示の段（横並び・中央寄せ）。
  doraTiles: { flexDirection: "row", justifyContent: "center", gap: 18, marginBottom: 14 },
  doraWrap: { alignItems: "center", gap: 4 },
  doraLbl: { fontSize: 10.5, color: colors.w45, fontWeight: "700" },
  doraRow: { flexDirection: "row", gap: 3 },
  yaku: { gap: 7, marginBottom: 13 },
  yrow: { flexDirection: "row", justifyContent: "space-between" },
  yname: { fontSize: 13.5, color: colors.white },
  yhan: { fontSize: 13.5, color: colors.accent, fontWeight: "800" },
  ynameDim: { fontSize: 12.5, color: colors.w45 },
  total: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "baseline",
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.line,
    paddingTop: 10,
  },
  totalLabel: { fontSize: 12.5, color: colors.w70 },
  totalScore: { fontWeight: "800", fontSize: 22, color: colors.white },
  deltas: { flexDirection: "row", gap: 6, marginTop: 4 },
  dc: {
    flex: 1,
    backgroundColor: colors.chrome2,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
    borderRadius: radius.sm,
    paddingVertical: 8,
    paddingHorizontal: 3,
    alignItems: "center",
  },
  dcWin: { borderColor: colors.accent },
  dn: { fontSize: 10, color: colors.w45, marginBottom: 4 },
  dv: { fontWeight: "800", fontSize: 13 },
  plus: { color: colors.emLite },
  minus: { color: colors.vermilion },
  zero: { color: colors.w45 },
});
