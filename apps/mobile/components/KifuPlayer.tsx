import type { GameLog } from "@rigel/client";
import type { Kifu, Seat } from "@rigel/schema";
import {
  buildPlaybackFrame,
  hasPlayerPoints,
  playbackKifu,
  resultLabel,
  roundNameForSeq,
  rulePresetLabel,
  signedPoints,
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
  // 結果のネタバレ防止: 和了演出に達するまで、ネームプレートの結果タグ（ツモ/ロン/放銃）や
  // 情報シートの「結果」「裏ドラ」を伏せる。局を移動したらまた伏せる。
  const [resultSeen, setResultSeen] = useState(false);
  // 視点席（席タップで切替）。null は牌譜どおり（撮影者が手前）。局を跨いでも保つ。
  const [povSeat, setPovSeat] = useState<Seat | null>(null);
  // リーグ戦ポイントの表示。null=自動（全員 0.0 なら隠す）。トグルで明示 ON/OFF。
  const [ptsPref, setPtsPref] = useState<boolean | null>(null);

  const log = logs[gi];
  const kifu: Kifu | undefined = log?.kifu;
  // リーグ戦ポイントの実効表示（明示トグル > 自動＝全員 0.0 なら隠す）。web ビューアと同一挙動。
  const showPlayerPoints = ptsPref ?? hasPlayerPoints(kifu?.players);

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
  // 結果を出してよいか（和了の無い局＝流局はネタバレ要素が無いのでそのまま）。
  const revealResult = resultSeen || kifu.agari.length === 0;
  // 盤面に渡す局面: 結果を伏せている間は agari を空にしてネームプレートの結果タグを消す。
  const tableKifu = revealResult ? boardKifu : { ...boardKifu, agari: [] };
  // 卓は横幅いっぱいまで拡大（上限は大画面向けの保険）。縦は上部バー＋場ナビ分を控える。
  const boardSize = Math.max(240, Math.min(width - 8, height - 240, 520));

  /** 局の切替（局送り・和了シートの「次の局へ」共通）。
   *  移動先は開始位置（配牌＝打牌前）から再生する。初期表示（reveal=-1 の全表示）と
   *  違い、局を移動する操作は「頭から見る」意図なので最終巡目にしない。 */
  function switchLog(i: number) {
    setGi(i);
    setReveal(0);
    setStepPhase(null);
    setAgariOpen(false);
    setResultSeen(false); // 新しい局ではまた結果を伏せる。
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
      setResultSeen(true); // 和了演出に入る＝以後は結果を出してよい。
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
      {/* 上部バー（全画面ボタンは廃止＝モバイルは全画面でもデザインが変わらない） */}
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
      </View>

      {/* 盤面 */}
      <View style={styles.stage}>
        <BoardTable
          kifu={tableKifu}
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
          showPlayerPoints={showPlayerPoints}
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
            {/* サブは本場（「局」の字は冗長。連荘の区別に本場の方が情報になる）。 */}
            <GroupLabel main={roundLabel} sub={`${kifu.meta.honba}本場`} />
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
          {/* リーグ戦ポイントの表示切替（players がある半荘のみ）。既定は自動＝全員 0.0 なら隠す。 */}
          {kifu.players ? (
            <Toggle
              active={showPlayerPoints}
              onPress={() => setPtsPref(!showPlayerPoints)}
              label="ポイント"
            />
          ) : null}
        </View>
      </View>

      {/* 情報シート（背景タップで閉じる）。セクションは見出しタップで開閉し、
          既定は局情報だけ開く（全部並べると縦に長く見づらいため）。 */}
      {sheetOpen ? (
        <BottomSheet onClose={() => setSheetOpen(false)} maxHeight="70%">
          <ScrollView contentContainerStyle={styles.sheetBody}>
            <Section title="局情報" defaultOpen>
              <KV k="親" v={`${windOf(dealer, dealer)}家`} />
              <View style={styles.kv}>
                <Text style={styles.kvK}>ドラ表示牌</Text>
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
                <Text style={styles.kvK}>裏ドラ表示牌</Text>
                <View style={styles.kvTiles}>
                  {/* 結果と同じくネタバレ要素なので、和了演出を見るまで伏せる。 */}
                  {!revealResult || viewKifu.meta.uraDora.length === 0 ? (
                    <Text style={styles.kvV}>—</Text>
                  ) : (
                    viewKifu.meta.uraDora.map((t, i) => (
                      <MiniTile key={`${t}-${i}`} code={t} w={20} h={28} />
                    ))
                  )}
                </View>
              </View>
              <KV k="本場 / 供託" v={`${viewKifu.meta.honba}本場 / ${viewKifu.meta.kyotaku}`} />
              {/* 結果はネタバレ防止のため、和了演出を見るまで伏せる。 */}
              <KV k="結果" v={revealResult ? resultLabel(viewKifu.result) : "—（再生で確認）"} />
            </Section>
            <Section title="各家">
              {SEAT_ORDER.map((seat) => (
                <KV
                  key={seat}
                  k={`${windOf(seat, dealer)}家`}
                  v={`手牌${viewKifu.seats[seat].hand.length}枚 / 河${viewKifu.seats[seat].river.length}${` / ${startPoints[seat].toLocaleString()}点`}`}
                />
              ))}
            </Section>
            {/* 選手情報（players がある半荘のみ）。ネームプレートの選手名は切り詰められる
                ことがあるため、ここではフル名＋ポイント状況を一覧できるようにする。 */}
            {kifu.players ? (
              <Section title="選手情報">
                {SEAT_ORDER.map((seat) => (
                  <KV
                    key={`p-${seat}`}
                    k={`${windOf(seat, dealer)}家 ${kifu.players?.[seat].name || "—"}`}
                    v={signedPoints(kifu.players?.[seat].points ?? 0)}
                  />
                ))}
              </Section>
            ) : null}
            {/* 半荘ルール（半荘単位＝全局共通）。web のサイドパネルと同じ要約行。 */}
            <Section title={`ルール（${rulePresetLabel(kifu.rules)}）`}>
              {ruleSummaryRows(kifu.rules).map((r) => (
                <KV key={r.title} k={r.title} v={r.value} />
              ))}
            </Section>
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
          onNext={gi < logs.length - 1 ? () => switchLog(gi + 1) : null}
        />
      ) : null}
    </View>
  );
}

/* ---------- 小物 ---------- */

function Dot() {
  return <View style={styles.dot} />;
}
/** 情報シートのセクション（見出しタップで開閉）。既定は閉＝縦長になりすぎない。 */
function Section({
  title,
  defaultOpen = false,
  children,
}: {
  title: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <View style={styles.section}>
      <Pressable
        style={styles.sectionHead}
        onPress={() => setOpen((v) => !v)}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
      >
        <Text style={styles.h3}>{title}</Text>
        <Text style={styles.sectionChevron}>{open ? "▴" : "▾"}</Text>
      </Pressable>
      {open ? children : null}
    </View>
  );
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
      // オン/オフをスクリーンリーダーに伝える（Segment/Chip と同じ流儀）。
      accessibilityState={{ selected: active }}
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
  sheetBody: { paddingBottom: 8 },
  h3: { color: colors.w45, fontWeight: "800", fontSize: 12 },
  // 情報シートのセクション（見出しタップで開閉）。
  section: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.line2,
    paddingBottom: 8,
    marginBottom: 4,
  },
  sectionHead: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 10,
  },
  sectionChevron: { color: colors.w45, fontSize: 12 },
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
