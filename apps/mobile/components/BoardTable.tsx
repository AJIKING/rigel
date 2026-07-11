import { toAbsoluteSeat, type CameraSeat, type Kifu, type Seat } from "@rigel/schema";
import { chunk, seatResult, splitDrawnTile, windOf, type DrawnTile } from "@rigel/ui";
import { useEffect, useRef } from "react";
import { Animated, Easing, Pressable, StyleSheet, Text, View, type ViewStyle } from "react-native";
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
/** 牌の登場演出（マウント時に一度だけ再生。対象牌ごとに key を変えて掛け直す）。
 *  席コンテナごと回転しているため、席ローカルの +Y=手牌側 / -Y=卓中央側。
 *  - 打牌 drop-in: distance>0（手牌側から河へ落ちる）
 *  - ツモ fly-in : distance<0（中央方向から手牌へ飛んでくる） */
function TileFx({
  children,
  distance,
  fromOpacity,
  fromScale,
  testID,
}: {
  children: React.ReactNode;
  distance: number;
  fromOpacity: number;
  fromScale: number;
  testID: string;
}) {
  const v = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(v, {
      toValue: 1,
      duration: 220,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [v]);
  return (
    <Animated.View
      testID={testID}
      style={{
        opacity: v.interpolate({ inputRange: [0, 1], outputRange: [fromOpacity, 1] }),
        transform: [
          { translateY: v.interpolate({ inputRange: [0, 1], outputRange: [distance, 0] }) },
          { scale: v.interpolate({ inputRange: [0, 1], outputRange: [fromScale, 1] }) },
        ],
      }}
    >
      {children}
    </Animated.View>
  );
}

const GEO = {
  riverTileW: 0.043, // 河牌の幅
  handTileW: 0.049, // 手牌の幅
  seatW: 0.74, // 席ボックスの幅
  seatH: 0.44, // 席ボックスの高さ
  seatOffset: 0.31, // 盤面中心から各席中心までの距離
  tileAspect: 1.4, // 牌の高さ/幅
} as const;

/** 回転卓。カメラ相対の4席を各辺に配置し内向きに回転する。
 *  既定は読み取り専用（ビューア）。onSeatPress を渡すと席がタップ可能になり、
 *  selectedSeat の席をハイライトする（エディタのプレビュー用）。 */
export function BoardTable({
  kifu,
  bottomSeat,
  dealer,
  roundLabel,
  revealed,
  showHands,
  ownerName,
  size = 330,
  selectedSeat,
  onSeatPress,
  highlightRiver = null,
  points = null,
  animateDiscard = null,
  drawnTile = null,
}: {
  kifu: Kifu;
  bottomSeat: Seat;
  dealer: Seat;
  roundLabel: string;
  /** 席ごとの河の公開枚数（再生用）。省略時は全表示。 */
  revealed?: Record<Seat, number>;
  showHands: boolean;
  ownerName?: string | null;
  size?: number;
  /** 編集対象としてハイライトする席（エディタのプレビュー用）。 */
  selectedSeat?: Seat;
  /** 席タップ時のコールバック。指定時のみ席が押せる。 */
  onSeatPress?: (seat: Seat) => void;
  /** 強調する河の1枚（何切るの鳴き判断の対象牌。web の highlightRiver と同じ意図）。 */
  highlightRiver?: { seat: Seat; index: number } | null;
  /** 再生中の点棒。指定時はネームプレートに表示する。 */
  points?: Record<Seat, number> | null;
  /** drop-in 演出を付ける河の1枚（いま置かれた打牌）。演出の第2段でだけ渡す。 */
  animateDiscard?: { seat: Seat; index: number } | null;
  /** 手牌の右端に離して置く1枚（再生中の一時ツモ／末尾のツモ和了牌）。出現時に
   *  フライインする。出すタイミングは呼び出し側（演出フェーズ／frame.tsumoWin）が決める。 */
  drawnTile?: DrawnTile | null;
}) {
  const B = size;
  const rt = B * GEO.riverTileW;
  const ht = B * GEO.handTileW;
  const seatW = B * GEO.seatW;
  const seatH = B * GEO.seatH;
  const off = B * GEO.seatOffset;
  const center = B / 2;
  const GAP = 1.5;

  /** n 枚が幅 avail に収まる 1 牌の幅を返す（既定サイズを上限、最小 7px）。
   *  牌数が多いほど縮めて重なり・はみ出しを防ぐ（牌が収まらない場合のサイズ調整）。 */
  const fitTileW = (base: number, n: number, avail: number, extra = 0): number => {
    if (n <= 0) return base;
    return Math.max(7, Math.min(base, (avail - (n - 1) * GAP - extra) / n));
  };

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
        const river = board.river.slice(0, revealed?.[seat] ?? board.river.length);
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
        const selected = selectedSeat === seat;

        // 河は6枚/段。最長段（最大6枚）が席幅の 70% に収まる牌サイズにする。
        const riverCols = Math.min(6, Math.max(1, river.length));
        const rtW = fitTileW(rt, riverCols, seatW * 0.7);
        const rtHt = rtW * GEO.tileAspect;
        // 右端スロットの1枚は手牌本体から離して置く（分割は @rigel/ui。web と共通）。
        const { hand: handShown, drawnTile: slotTile } = splitDrawnTile(
          board.hand,
          drawnTile,
          seat,
        );
        // 手牌＋鳴きは1列。総枚数が席幅の 92% に収まる牌サイズにする（重なり・はみ出し防止）。
        const meldTileCount = board.melds.reduce((n, m) => n + m.tiles.length, 0);
        const handUnits = handShown.length + (slotTile ? 1 : 0) + meldTileCount;
        const htW = fitTileW(ht, handUnits, seatW * 0.92, board.melds.length * 4);
        const htHt = htW * GEO.tileAspect;

        return (
          <Pressable
            key={cam}
            style={[seatStyle, styles.seat, selected && styles.seatSel]}
            disabled={!onSeatPress}
            onPress={onSeatPress ? () => onSeatPress(seat) : undefined}
            accessibilityLabel={onSeatPress ? `${wind}家を選択` : undefined}
          >
            {/* 河が空でも高さを確保して手牌を外側へ押し出す（左右席の手牌が中央で被るのを防ぐ）。 */}
            <View style={[styles.river, { minHeight: rtHt * 1.6 }]}>
              {chunk(river, 6).map((row, ri) => (
                <View key={ri} style={styles.rrow}>
                  {row.map((d, ci) => {
                    const tile = (
                      <MiniTile
                        key={ci}
                        code={d.tile}
                        w={rtW}
                        h={rtHt}
                        riichi={d.riichi}
                        tsumogiri={d.tsumogiri}
                        highlight={
                          highlightRiver?.seat === seat && highlightRiver.index === ri * 6 + ci
                        }
                      />
                    );
                    const drop =
                      animateDiscard?.seat === seat && animateDiscard.index === ri * 6 + ci;
                    // 対象牌ごとに key を変え、TileFx をマウントし直して演出を掛ける。
                    return drop ? (
                      <TileFx
                        key={`d${ri * 6 + ci}`}
                        testID="drop-tile"
                        distance={rtHt * 0.5}
                        fromOpacity={0.25}
                        fromScale={1.15}
                      >
                        {tile}
                      </TileFx>
                    ) : (
                      tile
                    );
                  })}
                </View>
              ))}
            </View>
            <View style={styles.plate}>
              <Text style={[styles.wd, isBottom && styles.wdWin]}>{wind}</Text>
              <Text style={styles.nm} numberOfLines={1}>
                {name}
              </Text>
              {points ? <Text style={styles.pts}>{points[seat].toLocaleString()}点</Text> : null}
              {seatResult(kifu.agari, seat) ? (
                <Text style={[styles.sc, seatResult(kifu.agari, seat) === "放銃" && styles.scLose]}>
                  {seatResult(kifu.agari, seat)}
                </Text>
              ) : null}
            </View>
            <View style={styles.hand}>
              {/* 表示は理牌（保存順が乱れた既存データも萬→筒→索→字で見せる）。 */}
              {handShown.map((h, hi) => (
                <MiniTile key={hi} code={hand ? h.tile : null} w={htW} h={htHt} back={!hand} />
              ))}
              {slotTile !== null ? (
                // key=牌: 連続ステップで牌が変わったら差し替えてフライインを掛け直す。
                <TileFx
                  key={slotTile}
                  testID="tsumo-tile"
                  distance={-B * 0.32}
                  fromOpacity={0}
                  fromScale={0.72}
                >
                  <View style={{ marginLeft: htW * 0.55 }}>
                    <MiniTile code={hand ? slotTile : null} w={htW} h={htHt} back={!hand} />
                  </View>
                </TileFx>
              ) : null}
              {board.melds.map((m, mi) => (
                <View key={`m${mi}`} style={styles.meld}>
                  {m.tiles.map((t, ti) => (
                    <MiniTile key={ti} code={t.tile} w={htW} h={htHt} />
                  ))}
                </View>
              ))}
            </View>
          </Pressable>
        );
      })}

      <View style={styles.center} pointerEvents="none">
        <View style={styles.roundRow}>
          <Text style={styles.round}>{roundLabel}</Text>
          {kifu.meta.honba > 0 ? <Text style={styles.sub}>{kifu.meta.honba}本場</Text> : null}
        </View>
        {kifu.meta.kyotaku > 0 ? <Text style={styles.sub}>供託 {kifu.meta.kyotaku}本</Text> : null}
        {/* ツモは中央に出さない（手牌へのフライイン演出で分かるため）。ドラのみ常設。 */}
        {kifu.meta.dora.length > 0 ? (
          <View style={styles.dora}>
            <Text style={styles.doraLbl}>ドラ</Text>
            {kifu.meta.dora.map((t, i) => (
              <MiniTile key={`${t}-${i}`} code={t} w={B * 0.05} h={B * 0.07} />
            ))}
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
  // エディタのプレビューで編集対象の席を示すハイライト。
  seatSel: {
    borderWidth: 1,
    borderColor: colors.accent,
    borderRadius: 8,
    backgroundColor: "rgba(255,158,69,0.08)",
  },
  // 河は左詰めで段を積む（実際の河のように左上から並ぶ）。
  river: { flexDirection: "column", alignItems: "flex-start", gap: 1.5, maxWidth: "72%" },
  rrow: { flexDirection: "row", justifyContent: "flex-start", gap: 1.5 },
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
  pts: { color: colors.accent, fontSize: 9.5, fontWeight: "800" },
  sc: {
    color: colors.accent,
    fontSize: 9.5,
    fontWeight: "800",
    backgroundColor: "rgba(0,0,0,0.28)",
    borderRadius: 2,
    paddingHorizontal: 4,
    overflow: "hidden",
  },
  scLose: { color: colors.vermilion },
  hand: { flexDirection: "row", gap: 1.5, alignItems: "flex-end" },
  meld: { flexDirection: "row", gap: 1, marginLeft: 4 },
  center: { position: "absolute", left: 0, right: 0, top: "40%", alignItems: "center", gap: 2 },
  roundRow: { flexDirection: "row", alignItems: "baseline", gap: 6 },
  round: {
    color: "#fff",
    fontWeight: "800",
    fontSize: 13,
    textShadowColor: "rgba(0,0,0,0.5)",
    textShadowRadius: 4,
  },
  sub: {
    color: "rgba(255,255,255,0.9)",
    fontWeight: "700",
    fontSize: 10.5,
    textShadowColor: "rgba(0,0,0,0.5)",
    textShadowRadius: 4,
  },
  dora: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 3 },
  doraLbl: {
    color: "rgba(255,255,255,0.9)",
    fontWeight: "700",
    fontSize: 9.5,
    textShadowColor: "rgba(0,0,0,0.5)",
    textShadowRadius: 4,
  },
});
