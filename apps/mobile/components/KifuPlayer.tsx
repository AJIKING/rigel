import type { GameLog } from "@rigel/client";
import type { Kifu, Seat } from "@rigel/schema";
import { buildRiverPlayback, revealCounts, roundName, windOf, SEAT_ORDER } from "@rigel/ui";
import { useEffect, useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Svg, { Path, Rect } from "react-native-svg";
import { colors, radius } from "../lib/theme";
import { AgariSheet } from "./AgariSheet";
import { BoardTable } from "./BoardTable";
import { CenterState } from "./CenterState";

const RESULT_LABEL: Record<string, string> = {
  ron: "ロン",
  tsumo: "ツモ",
  draw: "流局",
};

/** 半荘（局の並び）の読み取り専用プレイヤー。局送り・巡送り・1手送り・手牌トグル・情報・和了。 */
export function KifuPlayer({
  logs,
  title,
  authorLabel,
  ownerName,
  isPublic = false,
  initialIndex = 0,
}: {
  logs: GameLog[];
  /** 半荘タイトル（上部バー）。 */
  title?: string;
  /** 上部メタの著者表記（例: @kuro）。 */
  authorLabel?: string | null;
  /** 手前席の表示名。 */
  ownerName?: string | null;
  isPublic?: boolean;
  initialIndex?: number;
}) {
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const [gi, setGi] = useState(initialIndex);
  const [reveal, setReveal] = useState(-1); // -1 = 全表示
  const [showHands, setShowHands] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [agariClosed, setAgariClosed] = useState(false);

  const log = logs[gi];
  const kifu: Kifu | undefined = log?.kifu;
  const bottomSeat: Seat = kifu?.cameraBottomSeat ?? "east";
  const dealer: Seat = kifu?.meta.dealer ?? bottomSeat;

  const { order, junmeStops } = useMemo(
    () =>
      kifu ? buildRiverPlayback(kifu, dealer) : { order: [] as Seat[], junmeStops: [] as number[] },
    [kifu, dealer],
  );
  const shown = reveal < 0 || reveal > order.length ? order.length : reveal;
  const revealed = useMemo(() => revealCounts(order, shown), [order, shown]);
  const atEnd = order.length > 0 && reveal >= order.length;

  // 末尾から離れたら「和了シートを閉じた」フラグを解除し、再び末尾に達したとき出せるようにする
  //（web ビューアと同じ挙動。これが無いと一度閉じると同一局で二度と出ない）。
  useEffect(() => {
    if (!atEnd) setAgariClosed(false);
  }, [atEnd]);

  if (!log || !kifu) return <CenterState message="この半荘には局がありません。" />;

  // 局名は配列位置(gi)ではなく牌譜の実際の局順(seq)から出す。公開ビューアは公開局の
  // サブセットを渡すため、gi 基準だと「東一局」からの通し番号になり誤ラベルになる。
  const roundLabel = roundName(Math.max(0, log.seq - 1));
  const showAgari = atEnd && kifu.agari.length > 0 && !agariClosed;
  const curJunme = revealed[dealer];
  // 卓は横幅いっぱいまで拡大（上限は大画面向けの保険）。縦は上部バー＋場ナビ分を控えて溢れを防ぐ。
  const boardSize = Math.max(240, Math.min(width - 8, height - 240, 520));

  function switchLog(i: number) {
    setGi(i);
    setReveal(-1);
    setAgariClosed(false);
  }

  return (
    <View style={styles.root}>
      {/* 上部バー */}
      <View style={styles.vbar}>
        <View style={styles.ttl}>
          <Text style={styles.title} numberOfLines={1}>
            {title || roundLabel}
          </Text>
          <View style={styles.sub}>
            {isPublic ? <Text style={styles.pub}>公開</Text> : null}
            {isPublic ? <Dot /> : null}
            {authorLabel ? (
              <>
                <Text style={styles.subText}>{authorLabel}</Text>
                <Dot />
              </>
            ) : null}
            <Text style={styles.subText}>{logs.length}局</Text>
          </View>
        </View>
        <IconButton label="手牌表示" onPress={() => setShowHands((v) => !v)}>
          <EyeIcon color={showHands ? colors.accent : colors.w70} />
        </IconButton>
      </View>

      {/* 盤面 */}
      <View style={styles.stage}>
        <BoardTable
          kifu={kifu}
          bottomSeat={bottomSeat}
          dealer={dealer}
          roundLabel={roundLabel}
          revealed={revealed}
          showHands={showHands}
          ownerName={ownerName}
          size={boardSize}
        />
      </View>

      {/* 場ナビ（ホームインジケータ等の safe-area ぶん下余白を足す） */}
      <View style={[styles.nav, { paddingBottom: Math.max(20, insets.bottom + 12) }]}>
        <View style={styles.navrow}>
          <Group>
            <NavBtn
              icon="prevLog"
              disabled={gi === 0}
              onPress={() => switchLog(gi - 1)}
              label="前の局"
            />
            <GroupLabel main={roundLabel} sub="局" />
            <NavBtn
              icon="nextLog"
              disabled={gi >= logs.length - 1}
              onPress={() => switchLog(gi + 1)}
              label="次の局"
            />
          </Group>
          <Group>
            <NavBtn
              icon="prevJunme"
              disabled={shown <= 0}
              onPress={() => setReveal([...junmeStops].reverse().find((x) => x < shown) ?? 0)}
              label="前の巡目"
            />
            <GroupLabel main={`${curJunme}`} sub="巡" />
            <NavBtn
              icon="nextJunme"
              disabled={!junmeStops.some((x) => x > shown)}
              onPress={() => setReveal(junmeStops.find((x) => x > shown) ?? order.length)}
              label="次の巡目"
            />
          </Group>
        </View>
        <View style={styles.navrow}>
          <Group grow={false}>
            <NavBtn
              icon="stepPrev"
              disabled={shown <= 0}
              onPress={() => setReveal(Math.max(0, shown - 1))}
              label="1手戻る"
            />
            <NavBtn
              icon="stepNext"
              disabled={shown >= order.length}
              onPress={() => setReveal(Math.min(order.length, shown + 1))}
              label="1手進む"
            />
          </Group>
          <Toggle active={sheetOpen} onPress={() => setSheetOpen((v) => !v)} label="情報" />
          <Toggle active={showHands} onPress={() => setShowHands((v) => !v)} label="手牌" />
        </View>
      </View>

      {/* 情報シート */}
      {sheetOpen ? (
        <View style={styles.sheet}>
          <Pressable style={styles.handle} onPress={() => setSheetOpen(false)}>
            <View style={styles.grabber} />
          </Pressable>
          <ScrollView contentContainerStyle={styles.sheetBody}>
            <Text style={styles.h3}>局情報</Text>
            <KV k="親" v={`${windOf(dealer, dealer)}家`} />
            <KV k="ドラ" v={kifu.meta.dora ? "あり" : "—"} />
            <KV k="本場 / 供託" v={`${kifu.meta.honba}本場 / ${kifu.meta.kyotaku}`} />
            <KV k="結果" v={RESULT_LABEL[kifu.result ?? ""] ?? "—"} />
            <Text style={styles.h3}>各家</Text>
            {SEAT_ORDER.map((seat) => (
              <KV
                key={seat}
                k={`${windOf(seat, dealer)}家`}
                v={`手牌${kifu.seats[seat].hand.length}枚 / 河${kifu.seats[seat].river.length}`}
              />
            ))}
            <Text style={styles.muted}>点数は記録しません（打点は牌姿から計算）。</Text>
          </ScrollView>
        </View>
      ) : null}

      {/* 和了演出 */}
      {showAgari ? (
        <AgariSheet
          kifu={kifu}
          dealer={dealer}
          ownerName={ownerName}
          onClose={() => setAgariClosed(true)}
        />
      ) : null}
    </View>
  );
}

/* ---------- 小物 ---------- */

function Dot() {
  return <View style={styles.dot} />;
}
function KV({ k, v }: { k: string; v: string }) {
  return (
    <View style={styles.kv}>
      <Text style={styles.kvK}>{k}</Text>
      <Text style={styles.kvV}>{v}</Text>
    </View>
  );
}
function Group({ children, grow = true }: { children: React.ReactNode; grow?: boolean }) {
  return <View style={[styles.group, grow && { flex: 1 }]}>{children}</View>;
}
function GroupLabel({ main, sub }: { main: string; sub: string }) {
  return (
    <View style={styles.glab}>
      <Text style={styles.glabMain}>{main}</Text>
      <Text style={styles.glabSub}>{sub}</Text>
    </View>
  );
}
function NavBtn({
  icon,
  onPress,
  disabled,
  label,
}: {
  icon: NavIconName;
  onPress: () => void;
  disabled?: boolean;
  label: string;
}) {
  return (
    <Pressable
      style={[styles.navbtn, disabled && styles.navbtnDisabled]}
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      <NavIcon name={icon} color={disabled ? colors.w45 : colors.accent} />
    </Pressable>
  );
}
function Toggle({
  active,
  onPress,
  label,
}: {
  active: boolean;
  onPress: () => void;
  label: string;
}) {
  return (
    <Pressable
      style={[styles.tog, active && styles.togOn]}
      onPress={onPress}
      accessibilityRole="button"
    >
      <Text style={[styles.togText, active && styles.togTextOn]}>{label}</Text>
    </Pressable>
  );
}
function IconButton({
  children,
  onPress,
  label,
}: {
  children: React.ReactNode;
  onPress: () => void;
  label: string;
}) {
  return (
    <Pressable
      style={styles.ib}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      {children}
    </Pressable>
  );
}

/* ---------- アイコン ---------- */
function EyeIcon({ color }: { color: string }) {
  return (
    <Svg width={21} height={21} viewBox="0 0 24 24" fill="none">
      <Path
        d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z"
        stroke={color}
        strokeWidth={1.9}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Path d="M12 15a3 3 0 100-6 3 3 0 000 6z" stroke={color} strokeWidth={1.9} />
    </Svg>
  );
}
type NavIconName = "prevLog" | "nextLog" | "prevJunme" | "nextJunme" | "stepPrev" | "stepNext";

/** 場ナビのボタンアイコン（局送り=先頭バー付き三角、巡送り=二連三角、1手=三角）。 */
function NavIcon({ name, color }: { name: NavIconName; color: string }) {
  return (
    <Svg width={20} height={20} viewBox="0 0 24 24">
      {name === "prevLog" && <Rect x={5} y={5} width={2.4} height={14} rx={1} fill={color} />}
      {name === "nextLog" && <Rect x={16.6} y={5} width={2.4} height={14} rx={1} fill={color} />}
      <Path d={NAV_ICON_PATH[name]} fill={color} />
    </Svg>
  );
}
const NAV_ICON_PATH: Record<NavIconName, string> = {
  prevLog: "M20 5l-10 7 10 7z",
  nextLog: "M4 5l10 7-10 7z",
  prevJunme: "M12 5l-8 7 8 7zM21 5l-8 7 8 7z",
  nextJunme: "M12 5l8 7-8 7zM3 5l8 7-8 7z",
  stepPrev: "M16 5l-9 7 9 7z",
  stepNext: "M8 5l9 7-9 7z",
};

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  vbar: { flexDirection: "row", alignItems: "center", gap: 8, height: 48, paddingHorizontal: 10 },
  ttl: { flex: 1, minWidth: 0 },
  title: { color: colors.white, fontSize: 13.5, fontWeight: "700" },
  sub: { flexDirection: "row", alignItems: "center", marginTop: 2 },
  subText: { color: colors.w45, fontSize: 11 },
  pub: { color: colors.accent, fontSize: 11, fontWeight: "700" },
  dot: { width: 3, height: 3, borderRadius: 1.5, backgroundColor: colors.w45, marginHorizontal: 6 },
  ib: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
  stage: { flex: 1, alignItems: "center", justifyContent: "center", padding: 2 },
  nav: {
    paddingHorizontal: 14,
    paddingTop: 14,
    paddingBottom: 20,
    gap: 10,
    backgroundColor: colors.chrome,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.line,
  },
  navrow: { flexDirection: "row", alignItems: "center", gap: 10 },
  group: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.chrome2,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
    borderRadius: radius.base,
    overflow: "hidden",
  },
  glab: { flex: 1, alignItems: "center" },
  glabMain: { color: "#fff", fontWeight: "800", fontSize: 15 },
  glabSub: { color: colors.w45, fontSize: 10, fontWeight: "700", marginTop: -1 },
  navbtn: { width: 52, height: 52, alignItems: "center", justifyContent: "center" },
  navbtnDisabled: { opacity: 0.5 },
  tog: {
    height: 52,
    paddingHorizontal: 18,
    borderRadius: radius.base,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
    backgroundColor: colors.chrome2,
    alignItems: "center",
    justifyContent: "center",
  },
  togOn: { backgroundColor: colors.accentSoft, borderColor: colors.accent },
  togText: { color: colors.w70, fontWeight: "800", fontSize: 13.5 },
  togTextOn: { color: colors.accent },
  sheet: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 30,
    backgroundColor: colors.chrome,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.line,
    borderTopLeftRadius: 12,
    borderTopRightRadius: 12,
    maxHeight: "70%",
    shadowColor: "#000",
    shadowOpacity: 0.5,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: -10 },
  },
  handle: { paddingVertical: 9, alignItems: "center" },
  grabber: { width: 38, height: 4, borderRadius: 99, backgroundColor: colors.w45 },
  sheetBody: { paddingHorizontal: 16, paddingBottom: 24 },
  h3: { color: colors.w45, fontWeight: "800", fontSize: 12, marginTop: 12, marginBottom: 8 },
  kv: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.line2,
  },
  kvK: { color: colors.w70, fontSize: 13 },
  kvV: { color: colors.white, fontSize: 13, fontWeight: "700" },
  muted: { color: colors.w45, fontSize: 11, paddingTop: 8 },
});
