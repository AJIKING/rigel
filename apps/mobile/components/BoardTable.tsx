import { toAbsoluteSeat, type CameraSeat, type Kifu, type Seat } from "@rigel/schema";
import {
  chunk,
  meldTileViews,
  seatLabel,
  seatResult,
  pointsLabel,
  signedPoints,
  splitDrawnTile,
  windOf,
  type DrawnTile,
} from "@rigel/ui";
import { useEffect, useRef } from "react";
import { Animated, Easing, Pressable, StyleSheet, Text, View, type ViewStyle } from "react-native";
import { colors } from "../lib/theme";
import { MiniTile } from "./MiniTile";

const CAMS: CameraSeat[] = ["bottom", "right", "top", "left"];
/** 河のグリッド（6枚/段×4段で寸法を固定。web の .river と同じ規格）。 */
const RIVER_COLS = 6;
const RIVER_ROWS = 4;
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
  /** 河の風車オフセット（席ローカル +X への平行移動。実卓の河と同じずらし配置）。
   *  河は席軸に中央揃えのため、隣家の河と1段目両端の角が交差する（必要シフト量は
   *  rowW/2 − 内周距離 ≈ 0.059B）。全席を同方向（ローカル +X）へずらすと回転対称に
   *  より各コーナーで軸のどちらかが必ず離れ、交差が消える（検証は board-geometry.test）。 */
  riverShift: 0.065,
} as const;

/** 盤面座標系での各席の河の外接矩形（重なり検証用の純関数。描画と同じ式を使う）。
 *  席は中心 seatOffset・回転 ROT で配置され、河は席コンテンツ列の中央上端に載る。 */
export function riverRects(size: number): Record<CameraSeat, Rect> {
  const B = size;
  const rtW = B * GEO.riverTileW;
  const rtHt = rtW * GEO.tileAspect;
  const GAP = 1.5;
  const depth = rtHt * RIVER_ROWS + GAP * (RIVER_ROWS - 1);
  const rowW = rtW * RIVER_COLS + GAP * (RIVER_COLS - 1) + (rtHt - rtW);
  const shift = B * GEO.riverShift;
  // 席コンテンツ（河+プレート+手牌）はおおむね席ボックス内周側から始まる。
  // 保守的に「河の内周エッジ = 中心から seatOffset - seatH/2 + margin」で近似する
  //（実際の内周エッジは column 中央揃えでこれより外側＝この矩形は実物より厳しい）。
  const inner = B * (GEO.seatOffset - GEO.seatH / 2);
  const c = B / 2;
  return {
    bottom: { x: c - rowW / 2 + shift, y: c + inner, w: rowW, h: depth },
    top: { x: c - rowW / 2 - shift, y: c - inner - depth, w: rowW, h: depth },
    // rotate(90deg)=時計回り: ローカル +X → 盤面 +Y（下向き）。
    left: { x: c - inner - depth, y: c - rowW / 2 + shift, w: depth, h: rowW },
    // rotate(-90deg): ローカル +X → 盤面 -Y（上向き）。
    right: { x: c + inner, y: c - rowW / 2 - shift, w: depth, h: rowW },
  };
}

export type Rect = { x: number; y: number; w: number; h: number };

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
  seatName,
  size = 330,
  selectedSeat,
  onSeatPress,
  seatPressLabel,
  highlightRiver = null,
  points = null,
  showPlayerPoints = true,
  animateDiscard = null,
  drawnTile = null,
  absolutePlates = false,
}: {
  kifu: Kifu;
  bottomSeat: Seat;
  dealer: Seat;
  roundLabel: string;
  /** 席ごとの河の公開枚数（再生用）。省略時は全表示。 */
  revealed?: Record<Seat, number>;
  showHands: boolean;
  /** 表示名を付ける席（撮影者など）。視点を回しても席に付いたまま動く。無ければ全席「◯家」。 */
  seatName?: { seat: Seat; name: string } | null;
  size?: number;
  /** 編集対象としてハイライトする席（エディタのプレビュー用）。 */
  selectedSeat?: Seat;
  /** 席タップ時のコールバック。指定時のみ席が押せる。 */
  onSeatPress?: (seat: Seat) => void;
  /** 席タップの読み上げラベル（既定「◯家を選択」。ビューアの視点切替では差し替える）。 */
  seatPressLabel?: (wind: string) => string;
  /** 強調する河の1枚（何切るの鳴き判断の対象牌。web の highlightRiver と同じ意図）。 */
  highlightRiver?: { seat: Seat; index: number } | null;
  /** 再生中の点棒。指定時はネームプレートに表示する。 */
  points?: Record<Seat, number> | null;
  /** リーグ戦ポイント（players.points）をネームプレートに出すか。
   *  既定 true。全員 0.0 の半荘では呼び出し側が false にして隠す（トグルで戻せる）。 */
  showPlayerPoints?: boolean;
  /** drop-in 演出を付ける河の1枚（いま置かれた打牌）。演出の第2段でだけ渡す。 */
  animateDiscard?: { seat: Seat; index: number } | null;
  /** 手牌の右端に離して置く1枚（再生中の一時ツモ／末尾のツモ和了牌）。出現時に
   *  フライインする。出すタイミングは呼び出し側（演出フェーズ／frame.tsumoWin）が決める。 */
  drawnTile?: DrawnTile | null;
  /** ネームプレートを絶対席（東家…＋親マーク）で出す。編集プレビュー用:
   *  入力（自分の席・親）が絶対席なので、風表記（親基準）だとずれて見えるため。 */
  absolutePlates?: boolean;
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

  // 河は6枚/段×4段で寸法を固定する（再生位置・枚数に依存させない）。河が伸びるたびに
  // サイズが変わったり手牌・プレートが外へ押されたりして卓全体が揺れるのを防ぐ。
  const rtW = fitTileW(rt, RIVER_COLS, seatW * 0.7);
  const rtHt = rtW * GEO.tileAspect;
  const riverBox = {
    minHeight: rtHt * RIVER_ROWS + GAP * (RIVER_ROWS - 1),
    // 横向きのリーチ牌ぶん（高さ-幅の差）も確保して段の折返し幅を安定させる。
    width: rtW * RIVER_COLS + GAP * (RIVER_COLS - 1) + (rtHt - rtW),
  };

  return (
    <View style={[styles.board, { width: B, height: B, borderRadius: B * 0.01 }]}>
      {CAMS.map((cam) => {
        const seat = toAbsoluteSeat(cam, bottomSeat);
        const board = kifu.seats[seat];
        const wind = windOf(seat, dealer);
        const river = board.river.slice(0, revealed?.[seat] ?? board.river.length);
        const isBottom = seat === bottomSeat;
        // 選手名（リーグ戦の記録）＞ 画面固有の表示名（撮影者名など）＞「◯家」。
        // absolutePlates は絶対席＋親マーク（編集プレビュー: 入力とずれない表記）。
        const player = kifu.players?.[seat];
        const fallbackName = absolutePlates
          ? `${seatLabel(seat)}家${seat === dealer ? "（親）" : ""}`
          : `${wind}家`;
        const name = player?.name || (seatName?.seat === seat && seatName.name) || fallbackName;
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

        // 右端スロットの1枚は手牌本体から離して置く（分割は @rigel/ui。web と共通）。
        const { hand: handShown, drawnTile: slotTile } = splitDrawnTile(
          board.hand,
          drawnTile,
          seat,
        );
        // 手牌＋鳴きは1列。総枚数が席幅の 92% に収まる牌サイズにする（重なり・はみ出し防止）。
        // スロットは常に1枚ぶん数える（出現時に手牌サイズが変わって全体が動くのを防ぐ）。
        const meldTileCount = board.melds.reduce((n, m) => n + m.tiles.length, 0);
        const handUnits = handShown.length + 1 + meldTileCount;
        const htW = fitTileW(ht, handUnits, seatW * 0.92, board.melds.length * 4);
        const htHt = htW * GEO.tileAspect;

        return (
          <Pressable
            key={cam}
            style={[seatStyle, styles.seat, selected && styles.seatSel]}
            disabled={!onSeatPress}
            onPress={onSeatPress ? () => onSeatPress(seat) : undefined}
            accessibilityLabel={
              onSeatPress ? (seatPressLabel?.(wind) ?? `${wind}家を選択`) : undefined
            }
          >
            <View
              style={[
                styles.river,
                riverBox,
                // 風車オフセット（GEO.riverShift 参照）。回転した席ローカルの +X 方向。
                { transform: [{ translateX: B * GEO.riverShift }] },
              ]}
            >
              {chunk(river, RIVER_COLS).map((row, ri) => (
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
                        called={!!d.calledBy}
                        highlight={
                          highlightRiver?.seat === seat &&
                          highlightRiver.index === ri * RIVER_COLS + ci
                        }
                      />
                    );
                    const drop =
                      animateDiscard?.seat === seat &&
                      animateDiscard.index === ri * RIVER_COLS + ci;
                    // 対象牌ごとに key を変え、TileFx をマウントし直して演出を掛ける。
                    return drop ? (
                      <TileFx
                        key={`d${ri * RIVER_COLS + ci}`}
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
              {/* 風の1文字は親基準の表記なので、絶対席モードでは出さない（混乱の元）。 */}
              {absolutePlates ? null : (
                <Text style={[styles.wd, isBottom && styles.wdWin]}>{wind}</Text>
              )}
              <Text style={styles.nm} numberOfLines={1}>
                {name}
              </Text>
              {points ? <Text style={styles.pts}>{pointsLabel(points[seat])}</Text> : null}
              {/* リーグ戦等の積み上げポイント状況（players がある半荘のみ）。
                  全員 0.0 なら未記録とみなして隠す（呼び出し側のトグルで出せる）。 */}
              {showPlayerPoints && player ? (
                <Text style={styles.lpts}>{signedPoints(player.points)}</Text>
              ) : null}
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
              {/* スロット枠（間隔・幅）は常に確保し、中身だけ入れ替える
                  （出現時に手牌が動かない。間隔の定義もここ1箇所）。 */}
              <View style={{ marginLeft: htW * 0.55, width: htW }}>
                {slotTile !== null ? (
                  // key=牌: 連続ステップで牌が変わったら差し替えてフライインを掛け直す。
                  <TileFx
                    key={slotTile}
                    testID="tsumo-tile"
                    distance={-B * 0.32}
                    fromOpacity={0}
                    fromScale={0.72}
                  >
                    <MiniTile code={hand ? slotTile : null} w={htW} h={htHt} back={!hand} />
                  </TileFx>
                ) : null}
              </View>
              {/* 鳴きの向き・暗槓の背面は共有ルール（meldTileViews）。
                  横向きの位置が鳴き元を示す（上家=左端・対面=左から2枚目・下家=右端）。 */}
              {board.melds.map((m, mi) => (
                <View key={`m${mi}`} style={styles.meld}>
                  {meldTileViews(m, seat).map((v, ti) => (
                    <MiniTile
                      key={ti}
                      code={v.tile}
                      w={htW}
                      h={htHt}
                      riichi={v.lay}
                      back={v.back}
                    />
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
            <Text style={styles.doraLbl}>ドラ表示牌</Text>
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
  // 幅・高さは riverBox（6枚/段×4段の固定寸法）が真実源。
  river: { flexDirection: "column", alignItems: "flex-start", gap: 1.5 },
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
  // 選手情報（リーグpt チップ）や和了バッジと並んでも卓外へはみ出さない幅に抑える。
  nm: { color: "rgba(255,255,255,0.9)", fontSize: 10, fontWeight: "700", maxWidth: 70 },
  pts: { color: colors.accent, fontSize: 9.5, fontWeight: "800" },
  // リーグ戦等の積み上げポイント状況（持ち点と区別するチップ表示）。
  lpts: {
    color: colors.accent,
    fontSize: 9,
    fontWeight: "800",
    backgroundColor: "rgba(0,0,0,0.28)",
    borderRadius: 2,
    paddingHorizontal: 3,
    overflow: "hidden",
  },
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
