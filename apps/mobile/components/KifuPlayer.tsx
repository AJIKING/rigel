import type { GameLog } from "@rigel/client";
import type { Kifu, Seat } from "@rigel/schema";
import {
  buildPlaybackFrame,
  playbackKifu,
  resultLabel,
  roundNameForSeq,
  rulePresetLabel,
  ruleSummaryRows,
  stepDisplay,
  stepHasDraw,
  windOf,
  SEAT_ORDER,
  type StepPhase,
} from "@rigel/ui";
import { useMemo, useState } from "react";
import {
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Svg, { Path, Rect } from "react-native-svg";
import { kifuShareUrl } from "../lib/site";
import { colors, radius } from "../lib/theme";
import { AgariSheet } from "./AgariSheet";
import { BoardTable } from "./BoardTable";
import { BottomSheet } from "./BottomSheet";
import { CenterState } from "./CenterState";
import { MiniTile } from "./MiniTile";

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
  // 和了シート。次ボタンで開き、閉じるボタン/前ボタン/位置移動で閉じる。
  const [agariOpen, setAgariOpen] = useState(false);
  const [fs, setFs] = useState(false); // 全画面（上部バーを畳んで卓を最大化）
  // 視点席（席タップで切替）。null は牌譜どおり（撮影者が手前）。局を跨いでも保つ。
  const [povSeat, setPovSeat] = useState<Seat | null>(null);

  const log = logs[gi];
  const kifu: Kifu | undefined = log?.kifu;

  // 再生フレーム（打牌順・巡目・点棒・再生局面）は @rigel/ui の共有ロジックで一括導出。
  // 点棒は「局の開始時点」で固定（この局の途中増減は出さない）。
  const frame = useMemo(
    () =>
      kifu
        ? buildPlaybackFrame({
            kifu,
            prevKifus: logs.slice(0, gi).map((l) => l.kifu),
            reveal,
            povSeat,
          })
        : null,
    [gi, kifu, logs, reveal, povSeat],
  );
  // ステップの半歩: draw（ツモ牌が手牌右端に入る。盤面は1手前のまま）→
  // drop（打牌が河へ落ち、手牌が理牌される）→ …末尾では winDraw（ツモ和了牌を右端へ）
  // → 和了演出、を進む/戻るボタンが半歩ずつ刻む（タイマーでは進めない）。
  // ツモ牌が不明な手は半歩なし＝1押し1打牌。フェーズ→表示物の写像は @rigel/ui（stepDisplay）。
  const [stepPhase, setStepPhase] = useState<StepPhase | null>(null);
  const shown = frame?.shown ?? 0;

  // draw 半歩で見せる1手前の局面。Zod parse を含むため draw 表示中だけ導出する。
  const prevKifu = useMemo(
    () => (stepPhase === "draw" && kifu && shown > 0 ? playbackKifu(kifu, shown - 1) : null),
    [kifu, shown, stepPhase],
  );
  const step = frame ? stepDisplay(stepPhase, frame, prevKifu) : null;

  if (!log || !kifu || !frame || !step)
    return <CenterState message="この半荘には局がありません。" />;

  const { order, junmeStops, curJunme, startPoints, viewKifu, bottomSeat, dealer } = frame;
  // 卓の表示物（局面・右端スロット・drop 対象）はフェーズ写像（@rigel/ui）から得る。
  const { kifu: boardKifu, drawnTile, animateDiscard } = step;

  const roundLabel = roundNameForSeq(log.seq);
  const showAgari = agariOpen && kifu.agari.length > 0;
  // 卓は横幅いっぱいまで拡大（上限は大画面向けの保険）。縦は上部バー(全画面時は無し)＋場ナビ分を控える。
  const boardSize = Math.max(240, Math.min(width - 8, height - (fs ? 150 : 240), 520));

  function switchLog(i: number) {
    setGi(i);
    setReveal(-1);
    setStepPhase(null);
    setAgariOpen(false);
  }

  /** 再生位置ジャンプ（巡目送りなど）。半歩は挟まず演出も出さない。 */
  function jumpTo(nextReveal: number) {
    setReveal(nextReveal);
    setStepPhase(null);
    setAgariOpen(false);
  }

  /** 次ボタン: ツモ→捨て→…→（末尾）和了牌ツモ→和了演出、の半歩を1つ進める。 */
  function stepForward() {
    if (!kifu || !frame || agariOpen) return;
    if (stepPhase === "draw") {
      setStepPhase("drop");
      return;
    }
    if (shown >= frame.order.length) {
      // 末尾（初期の全表示含む）: ツモ和了なら先に和了牌をツモり、次押しで和了演出。
      if (kifu.agari.length === 0) return;
      setReveal(frame.order.length); // -1（全表示）でも実位置に確定させる。
      if (frame.tsumoWin && stepPhase !== "winDraw") {
        setStepPhase("winDraw");
        return;
      }
      setAgariOpen(true);
      return;
    }
    const next = shown + 1;
    setReveal(next);
    setStepPhase(stepHasDraw(kifu, next) ? "draw" : "drop");
  }

  /** 前ボタン: 和了演出を閉じる→和了牌を引っ込める→打牌を引っ込めてツモ表示へ→前の手…と逆に刻む。 */
  function stepBack() {
    if (!kifu) return;
    if (agariOpen) {
      setAgariOpen(false);
      return;
    }
    if (stepPhase === "winDraw") {
      setStepPhase(null);
      return;
    }
    if (stepPhase === "draw") {
      jumpTo(Math.max(0, shown - 1));
      return;
    }
    if (shown > 0 && stepHasDraw(kifu, shown)) {
      setReveal(shown);
      setStepPhase("draw");
      return;
    }
    jumpTo(Math.max(0, shown - 1));
  }

  // 公開牌譜の共有（web 公開ページ /k/:gameId を OS 共有シートで）。
  async function onShare() {
    const url = kifuShareUrl(log.gameId ?? "");
    await Share.share({ message: `${title || roundLabel}\n${url}`, url }).catch(() => {});
  }

  return (
    <View style={styles.root}>
      {/* 上部バー（全画面時は畳む） */}
      {fs ? (
        <Pressable
          style={[styles.fsExit, { top: insets.top + 6 }]}
          onPress={() => setFs(false)}
          accessibilityRole="button"
          accessibilityLabel="全画面を終了"
        >
          <ExpandIcon color={colors.accent} exit />
        </Pressable>
      ) : (
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
          {isPublic ? (
            <IconButton label="共有" onPress={() => void onShare()}>
              <ShareIcon color={colors.w70} />
            </IconButton>
          ) : null}
          {/* 手牌表示は下の場ナビ「手牌」トグルに一本化（目のアイコンは廃止＝機能重複の解消）。 */}
          <IconButton label="全画面" onPress={() => setFs(true)}>
            <ExpandIcon color={colors.w70} />
          </IconButton>
        </View>
      )}

      {/* 盤面 */}
      <View style={styles.stage}>
        <BoardTable
          kifu={boardKifu}
          bottomSeat={bottomSeat}
          dealer={dealer}
          roundLabel={roundLabel}
          showHands={showHands}
          // 撮影者名は撮影者の席（cameraBottomSeat）に付ける。視点を回しても席と一緒に動く。
          seatName={{ seat: kifu.cameraBottomSeat ?? "east", name: ownerName ?? "" }}
          // 席タップで視点切替（その席が手前へ回る）。
          onSeatPress={setPovSeat}
          seatPressLabel={(w) => `${w}家の視点にする`}
          size={boardSize}
          points={startPoints}
          animateDiscard={animateDiscard}
          drawnTile={drawnTile}
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
              onPress={() => jumpTo([...junmeStops].reverse().find((x) => x < shown) ?? 0)}
              label="前の巡目"
            />
            <GroupLabel main={`${curJunme}`} sub="巡" />
            <NavBtn
              icon="nextJunme"
              disabled={!junmeStops.some((x) => x > shown)}
              onPress={() => jumpTo(junmeStops.find((x) => x > shown) ?? order.length)}
              label="次の巡目"
            />
          </Group>
        </View>
        <View style={styles.navrow}>
          <Group grow={false}>
            <NavBtn icon="stepPrev" disabled={shown <= 0} onPress={stepBack} label="1手戻る" />
            <NavBtn
              icon="stepNext"
              disabled={
                agariOpen ||
                (shown >= order.length && stepPhase !== "draw" && kifu.agari.length === 0)
              }
              onPress={stepForward}
              label="1手進む"
            />
          </Group>
          <Toggle active={sheetOpen} onPress={() => setSheetOpen((v) => !v)} label="情報" />
          <Toggle active={showHands} onPress={() => setShowHands((v) => !v)} label="手牌" />
        </View>
      </View>

      {/* 情報シート（backdrop 無し＝出したまま下の場ナビを操作できる） */}
      {sheetOpen ? (
        <BottomSheet onClose={() => setSheetOpen(false)} backdrop={false} maxHeight="70%">
          <ScrollView contentContainerStyle={styles.sheetBody}>
            <Text style={styles.h3}>局情報</Text>
            <KV k="親" v={`${windOf(dealer, dealer)}家`} />
            <View style={styles.kv}>
              <Text style={styles.kvK}>ドラ</Text>
              <View style={styles.kvTiles}>
                {viewKifu.meta.dora.length === 0 ? (
                  <Text style={styles.kvV}>—</Text>
                ) : (
                  viewKifu.meta.dora.map((t, i) => (
                    <MiniTile key={`${t}-${i}`} code={t} w={20} h={28} />
                  ))
                )}
              </View>
            </View>
            <View style={styles.kv}>
              <Text style={styles.kvK}>裏ドラ</Text>
              <View style={styles.kvTiles}>
                {viewKifu.meta.uraDora.length === 0 ? (
                  <Text style={styles.kvV}>—</Text>
                ) : (
                  viewKifu.meta.uraDora.map((t, i) => (
                    <MiniTile key={`${t}-${i}`} code={t} w={20} h={28} />
                  ))
                )}
              </View>
            </View>
            <KV k="本場 / 供託" v={`${viewKifu.meta.honba}本場 / ${viewKifu.meta.kyotaku}`} />
            <KV k="結果" v={resultLabel(viewKifu.result)} />
            <Text style={styles.h3}>各家</Text>
            {SEAT_ORDER.map((seat) => (
              <KV
                key={seat}
                k={`${windOf(seat, dealer)}家`}
                v={`手牌${viewKifu.seats[seat].hand.length}枚 / 河${viewKifu.seats[seat].river.length}${` / ${startPoints[seat].toLocaleString()}点`}`}
              />
            ))}
            {/* 半荘ルール（半荘単位＝全局共通）。web のサイドパネルと同じ要約行。 */}
            <Text style={styles.h3}>ルール（{rulePresetLabel(kifu.rules)}）</Text>
            {ruleSummaryRows(kifu.rules).map((r) => (
              <KV key={r.title} k={r.title} v={r.value} />
            ))}
          </ScrollView>
        </BottomSheet>
      ) : null}

      {/* 和了演出 */}
      {showAgari ? (
        <AgariSheet
          kifu={viewKifu}
          dealer={dealer}
          ownerName={ownerName}
          onClose={() => setAgariOpen(false)}
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
function ShareIcon({ color }: { color: string }) {
  return (
    <Svg width={20} height={20} viewBox="0 0 24 24" fill="none">
      <Path
        d="M18 5a3 3 0 100 .01M6 12a3 3 0 100 .01M18 19a3 3 0 100 .01M8.6 13.5l6.8 4M15.4 6.5l-6.8 4"
        stroke={color}
        strokeWidth={1.9}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}
function ExpandIcon({ color, exit = false }: { color: string; exit?: boolean }) {
  return (
    <Svg width={20} height={20} viewBox="0 0 24 24" fill="none">
      <Path
        d={
          exit
            ? "M9 4H4v5M20 9V4h-5M9 20H4v-5M15 20h5v-5"
            : "M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"
        }
        stroke={color}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
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
  fsExit: {
    position: "absolute",
    right: 10,
    zIndex: 10,
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 20,
    backgroundColor: "rgba(0,0,0,0.35)",
  },
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
  sheetBody: { paddingBottom: 8 },
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
  kvTiles: { flexDirection: "row", gap: 4 },
});
