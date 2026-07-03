import { toAbsoluteSeat, type CameraSeat, type Kifu, type Seat } from "@rigel/schema";
import { chunk, windOf } from "@rigel/ui";
import { StyleSheet, Text, View, type ViewStyle } from "react-native";
import { colors } from "../lib/theme";
import { MiniTile } from "./MiniTile";

const CAMS: CameraSeat[] = ["bottom", "right", "top", "left"];
const ROT: Record<CameraSeat, string> = {
  bottom: "0deg",
  top: "180deg",
  left: "90deg",
  right: "-90deg",
};

/**
 * 回転卓のジオメトリ（すべて盤面サイズ B に対する比率）。実機での見た目調整は
 * まずここを触る（席の大きさ・中心からの距離・牌の寸法を一括で管理する）。
 */
const GEO = {
  riverTileW: 0.043, // 河牌の幅
  handTileW: 0.049, // 手牌の幅
  seatW: 0.74, // 席ボックスの幅
  seatH: 0.44, // 席ボックスの高さ
  seatOffset: 0.31, // 盤面中心から各席中心までの距離
  tileAspect: 1.4, // 牌の高さ/幅
} as const;

/** 回転卓（読み取り専用）。カメラ相対の4席を各辺に配置し内向きに回転する。 */
export function BoardTable({
  kifu,
  bottomSeat,
  dealer,
  roundLabel,
  revealed,
  showHands,
  ownerName,
  size = 330,
}: {
  kifu: Kifu;
  bottomSeat: Seat;
  dealer: Seat;
  roundLabel: string;
  revealed: Record<Seat, number>;
  showHands: boolean;
  ownerName?: string | null;
  size?: number;
}) {
  const B = size;
  const rt = B * GEO.riverTileW;
  const rtH = rt * GEO.tileAspect;
  const ht = B * GEO.handTileW;
  const htH = ht * GEO.tileAspect;
  const seatW = B * GEO.seatW;
  const seatH = B * GEO.seatH;
  const off = B * GEO.seatOffset;
  const center = B / 2;

  const seatPos: Record<CameraSeat, { cx: number; cy: number }> = {
    bottom: { cx: center, cy: center + off },
    top: { cx: center, cy: center - off },
    left: { cx: center - off, cy: center },
    right: { cx: center + off, cy: center },
  };

  return (
    <View style={[styles.board, { width: B, height: B, borderRadius: B * 0.01 }]}>
      {CAMS.map((cam) => {
        const seat = toAbsoluteSeat(cam, bottomSeat);
        const board = kifu.seats[seat];
        const wind = windOf(seat, dealer);
        const river = board.river.slice(0, revealed[seat]);
        const isBottom = seat === bottomSeat;
        const name = isBottom ? ownerName || `${wind}家` : `${wind}家`;
        const { cx, cy } = seatPos[cam];
        const seatStyle: ViewStyle = {
          position: "absolute",
          width: seatW,
          height: seatH,
          left: cx - seatW / 2,
          top: cy - seatH / 2,
          transform: [{ rotate: ROT[cam] }],
        };

        const hand = isBottom || showHands;
        return (
          <View key={cam} style={[seatStyle, styles.seat]}>
            <View style={styles.river}>
              {chunk(river, 6).map((row, ri) => (
                <View key={ri} style={styles.rrow}>
                  {row.map((d, ci) => (
                    <MiniTile
                      key={ci}
                      code={d.tile}
                      w={rt}
                      h={rtH}
                      riichi={d.riichi}
                      tsumogiri={d.tsumogiri}
                    />
                  ))}
                </View>
              ))}
            </View>
            <View style={styles.plate}>
              <Text style={[styles.wd, isBottom && styles.wdWin]}>{wind}</Text>
              <Text style={styles.nm} numberOfLines={1}>
                {name}
              </Text>
            </View>
            <View style={styles.hand}>
              {board.hand.map((h, hi) => (
                <MiniTile key={hi} code={hand ? h.tile : null} w={ht} h={htH} back={!hand} />
              ))}
              {board.melds.map((m, mi) => (
                <View key={`m${mi}`} style={styles.meld}>
                  {m.tiles.map((t, ti) => (
                    <MiniTile key={ti} code={t.tile} w={ht} h={htH} />
                  ))}
                </View>
              ))}
            </View>
          </View>
        );
      })}

      <View style={styles.center} pointerEvents="none">
        <Text style={styles.round}>{roundLabel}</Text>
        {kifu.meta.dora ? (
          <View style={styles.dora}>
            <MiniTile code={kifu.meta.dora} w={B * 0.05} h={B * 0.07} />
          </View>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  board: {
    position: "relative",
    backgroundColor: colors.emDeep,
    overflow: "hidden",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(255,255,255,0.08)",
  },
  seat: { alignItems: "center", justifyContent: "center", gap: 4 },
  river: { flexDirection: "column", alignItems: "center", gap: 1.5, maxWidth: "70%" },
  rrow: { flexDirection: "row", gap: 1.5 },
  plate: { flexDirection: "row", alignItems: "center", gap: 4 },
  wd: {
    color: "#fff",
    fontWeight: "800",
    fontSize: 10,
    backgroundColor: "rgba(0,0,0,0.28)",
    borderRadius: 2,
    paddingHorizontal: 4,
    overflow: "hidden",
  },
  wdWin: { backgroundColor: colors.accent, color: "#16181d" },
  nm: { color: "rgba(255,255,255,0.9)", fontSize: 10, fontWeight: "700", maxWidth: 90 },
  hand: { flexDirection: "row", gap: 1.5, alignItems: "flex-end" },
  meld: { flexDirection: "row", gap: 1, marginLeft: 4 },
  center: { position: "absolute", left: 0, right: 0, top: "44%", alignItems: "center" },
  round: {
    color: "#fff",
    fontWeight: "800",
    fontSize: 13,
    textShadowColor: "rgba(0,0,0,0.5)",
    textShadowRadius: 4,
  },
  dora: { flexDirection: "row", gap: 3, justifyContent: "center", marginTop: 4 },
});
