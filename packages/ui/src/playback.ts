import {
  KifuSchema,
  type Discard,
  type Kifu,
  type MeldType,
  type ReadTile,
  type Seat,
  type SeatBoard,
  type Tile,
  type TimelineEvent,
} from "@rigel/schema";
import { buildRiverPlayback, revealCounts, type RiverPlayback } from "./board";
import { sortHandTiles } from "./edit";
import { standings, type SeatDeltas } from "./standings";
import { deriveTimeline } from "./timeline";

export interface PlaybackState {
  /** そのステップ時点の盤面（手牌の再構成は編集済のみ。下記 morph を参照）。 */
  seats: Kifu["seats"];
  /** 局開始時の供託 + 再生済みリーチ宣言（リーチ棒の増加）。 */
  kyotaku: number;
  /** 直近で適用したツモ。描画側のツモ演出に使う。不明・未編集なら null。 */
  activeDraw: { seat: Seat; tile: Tile | null } | null;
  /** 直近で河へ置いた打牌の位置。描画側の打牌演出に使う。0手目は null。 */
  activeDiscard: { seat: Seat; riverIndex: number } | null;
}

function cloneReadTiles(tiles: ReadTile[]): ReadTile[] {
  return tiles.map((t) => ({ ...t }));
}

function cloneMelds(melds: SeatBoard["melds"]): SeatBoard["melds"] {
  return melds.map((m) => ({ ...m, tiles: cloneReadTiles(m.tiles) }));
}

/** 再生開始時の席（手牌は配牌 or スナップショットとして保持。河は空から積む）。
 *  morph=true（編集済）は鳴きも timeline から積むので melds は空、false は静的に保持。 */
function initSeatBoard(board: SeatBoard, morph: boolean): SeatBoard {
  return {
    hand: cloneReadTiles(board.hand),
    river: [],
    melds: morph ? [] : cloneMelds(board.melds),
  };
}

/** timeline の打牌イベントを河の1牌（Discard）へ写す。 */
function toDiscard(event: Extract<TimelineEvent, { kind: "discard" }>, order: number): Discard {
  return {
    order,
    tile: event.tile,
    riichi: event.riichi,
    tsumogiri: event.tsumogiri,
    calledBy: event.calledBy,
    confidence: event.confidence,
  };
}

/** 未編集（AI/スナップショット）用: 手牌を触らず打牌だけ河へ積む。 */
function pushRiverOnly(board: SeatBoard, event: Extract<TimelineEvent, { kind: "discard" }>): void {
  board.river.push(toDiscard(event, board.river.length + 1));
}

function removeOne(hand: ReadTile[], tile: Tile | null): void {
  if (tile === null) return;
  const i = hand.findIndex((t) => t.tile === tile);
  if (i >= 0) hand.splice(i, 1);
}

function pushDraw(hand: ReadTile[], tile: Tile | null, confidence: number): void {
  if (tile !== null) hand.push({ tile, confidence });
}

/** 鳴きで手牌から消費する枚数（残りは鳴き元の打牌など手牌外から来る牌）。 */
const MELD_HAND_USED: Record<MeldType, number> = {
  chi: 2,
  pon: 2,
  kan_open: 3,
  kan_added: 1, // 加槓は既存ポンに1枚足す
  kan_closed: 4,
};

function applyMeld(
  seats: Record<Seat, SeatBoard>,
  event: Extract<TimelineEvent, { kind: "meld" }>,
): void {
  const board = seats[event.seat];
  board.melds.push(event.meld);
  const used = MELD_HAND_USED[event.meld.type];
  for (const t of event.meld.tiles.slice(0, used)) removeOne(board.hand, t.tile);
  // 鳴かれた捨て牌の薄表示は「鳴きが開く瞬間」から（applyDiscard は calledBy を伏せて積む）。
  // 鳴きは直前の打牌を取るので、鳴き元(from)の直近の捨て牌に印を付ける。
  if (event.meld.from) {
    const river = seats[event.meld.from].river;
    const last = river[river.length - 1];
    if (last) last.calledBy = event.seat;
  }
}

function applyDiscard(
  board: SeatBoard,
  event: Extract<TimelineEvent, { kind: "discard" }>,
): Discard {
  if (event.tsumogiri) {
    // ツモ切りはツモ牌を手牌へ残さず、打牌だけ河へ置く。
  } else {
    pushDraw(board.hand, event.draw, event.confidence);
    removeOne(board.hand, event.tile);
  }

  // 鳴かれた印(calledBy)は捨てた時点では伏せ、鳴きイベント（applyMeld）が開く瞬間に付ける
  // （再生で「捨てた直後から薄い」誤演出を防ぐ）。
  const discard = { ...toDiscard(event, board.river.length + 1), calledBy: null };
  board.river.push(discard);
  return discard;
}

/**
 * shownDiscards 手（＝打牌の数）ぶん進めた再生局面を導出する。
 * ------------------------------------------------------------
 * 歩幅は打牌単位（再生ステッパ＝buildRiverPlayback の order も打牌のみ）。鳴きは間に
 * 挟まっても打牌数でズレず、次の打牌が出る直前の鳴きは伏せる（打牌と一緒に開く）。
 *
 * 手牌の再構成（配牌→ツモを足し打牌を引く）は「編集済＝timeline を持つ牌譜」に限定する。
 * AI/未編集（timeline 空）の hand は撮影時点のスナップショットで配牌ではないため、前進再生
 * すると崩れる。その場合は手牌・鳴きを静的に見せ、河だけ進める。
 */
export function buildPlaybackState(kifu: Kifu, shownDiscards: number): PlaybackState {
  const timeline = deriveTimeline(kifu);
  // timeline を持つ＝配牌と打牌順が確定した編集済牌譜だけ手牌を組み替える。
  const morph = kifu.timeline.length > 0;
  const seats = {
    east: initSeatBoard(kifu.seats.east, morph),
    south: initSeatBoard(kifu.seats.south, morph),
    west: initSeatBoard(kifu.seats.west, morph),
    north: initSeatBoard(kifu.seats.north, morph),
  };
  let kyotaku = kifu.meta.kyotaku;
  let activeDraw: PlaybackState["activeDraw"] = null;
  let activeDiscard: PlaybackState["activeDiscard"] = null;
  let shown = 0;

  for (const event of timeline) {
    if (shown >= shownDiscards) break; // 要求した打牌数に達したら止める（後続の鳴きも待つ）。
    if (event.kind === "discard") {
      if (morph) applyDiscard(seats[event.seat], event);
      else pushRiverOnly(seats[event.seat], event);
      shown += 1;
      activeDraw = morph && event.draw !== null ? { seat: event.seat, tile: event.draw } : null;
      activeDiscard = { seat: event.seat, riverIndex: seats[event.seat].river.length - 1 };
      if (event.riichi) kyotaku += 1; // リーチ宣言＝リーチ棒（供託）+1。
    } else if (morph) {
      applyMeld(seats, event);
      activeDraw = null;
    }
  }

  return { seats, kyotaku, activeDraw, activeDiscard };
}

/** 再生状態を既存の卓コンポーネントへ渡しやすい Kifu 形に変換する（状態を持っている側用）。 */
export function playbackStateToKifu(kifu: Kifu, state: PlaybackState): Kifu {
  return KifuSchema.parse({
    ...kifu,
    seats: state.seats,
    meta: { ...kifu.meta, kyotaku: state.kyotaku },
  });
}

/** 再生局面を Kifu 形で得るショートカット（状態を別に使わない呼び出し向け）。 */
export function playbackKifu(kifu: Kifu, shownDiscards: number): Kifu {
  return playbackStateToKifu(kifu, buildPlaybackState(kifu, shownDiscards));
}

/** 手牌の右端に離して置く1枚（再生中の一時ツモ／末尾のツモ和了牌の両用）。 */
export interface DrawnTile {
  seat: Seat;
  tile: Tile;
}

/** ステップの半歩フェーズ。draw=ツモ牌が右端スロットへ（盤面は1手前のまま）／
 *  drop=打牌が河へ落ち手牌が理牌される／winDraw=末尾でツモ和了牌を右端スロットへ。
 *  null=半歩なし（初期表示・ジャンプ）。進む/戻るボタンが半歩ずつ刻む
 *  （ツモる→捨てる→…→和了牌をツモる→和了演出。タイマーでは進めない）。 */
export type StepPhase = "draw" | "drop" | "winDraw";

/**
 * ツモ和了牌の導出（web/mobile 共通）。正は Kifu.agari（winner / from=null がツモ /
 * winTile）。最終ツモは打牌イベントにしない（河へ捨てる誤演出になる）ので、
 * timeline ではなくここから導出する。最終局面でだけ意味を持つ値なので、
 * ビューアは buildPlaybackFrame 経由（frame.tsumoWin）で受け取る。
 */
export function tsumoWinDisplay(kifu: Kifu): DrawnTile | null {
  const agari = kifu.agari.find((a) => a.from === null && a.winTile !== null);
  return agari?.winTile ? { seat: agari.winner, tile: agari.winTile } : null;
}

/**
 * 席の手牌を「本体（理牌済み）」と「右端に離して置く1枚」に割る（レンダラ共通）。
 * 理牌とスロット振り分けのみで、手牌本体からは抜かない
 * （ツモ和了牌の除去は buildPlaybackFrame の viewKifu 導出が担う）。
 */
export function splitDrawnTile(
  hand: ReadTile[],
  drawn: DrawnTile | null,
  seat: Seat,
): { hand: ReadTile[]; drawnTile: Tile | null } {
  return {
    hand: sortHandTiles(hand),
    drawnTile: drawn?.seat === seat ? drawn.tile : null,
  };
}

/** ビューアが1ステップぶんの描画に使う値一式（KifuViewer/KifuPlayer が共有）。 */
export interface PlaybackFrame extends RiverPlayback {
  /** 手前席（カメラ相対 bottom）。 */
  bottomSeat: Seat;
  dealer: Seat;
  /** 再生済みの打牌数（reveal を打牌数へクランプしたもの）。 */
  shown: number;
  /** 現在の巡目（親の打牌数。0巡は出さず最小1）。 */
  curJunme: number;
  /** 局の開始時点の持ち点（rules.start + 直前局までの増減）。 */
  startPoints: SeatDeltas;
  playback: PlaybackState;
  /** 再生局面を Kifu 形にしたもの（卓コンポーネントへそのまま渡す）。 */
  viewKifu: Kifu;
  /** 再生が末尾に達したか（和了演出の発火に使う。初期の全表示 reveal=-1 は false）。 */
  atEnd: boolean;
  /** ツモ和了牌（この局がツモ和了なら非 null）。スロットに描くタイミングは
   *  stepDisplay の winDraw フェーズ（次ボタンで明示的にツモる半歩）が決める。 */
  tsumoWin: DrawnTile | null;
}

/** 直近のステップで引いたツモ牌（右端スロット表示の形）。ツモ不明・0手目は null。 */
export function activeDrawnTile(state: PlaybackState): DrawnTile | null {
  const draw = state.activeDraw;
  return draw?.tile ? { seat: draw.seat, tile: draw.tile } : null;
}

/** step 手目（1始まり）に「ツモる」半歩があるか。進む/戻るボタンが半歩を刻むか
 *  1押し=1打牌かの判定に使う。未編集（timeline 空＝スナップショット手牌）は常に false。 */
export function stepHasDraw(kifu: Kifu, step: number): boolean {
  if (kifu.timeline.length === 0 || step < 1) return false;
  const discards = deriveTimeline(kifu).filter((e) => e.kind === "discard");
  return discards[step - 1]?.draw != null;
}

/** ステップ演出フェーズ → 盤面表示物の写像（web/mobile 共通の純関数）。 */
export interface StepDisplay {
  /** 卓に描く局面。draw 段階は1手前（prevKifu）、それ以外は現在（frame.viewKifu）。 */
  kifu: Kifu;
  /** 手牌右端スロットの1枚。draw 段階=一時ツモ牌、winDraw 段階=ツモ和了牌。 */
  drawnTile: DrawnTile | null;
  /** drop 演出を付ける河の1枚。drop 段階だけ。 */
  animateDiscard: { seat: Seat; index: number } | null;
  /** draw 段階（盤面が1手前）を表示中か。 */
  drawing: boolean;
}

/**
 * 半歩ステップの表示導出。フェーズ state とボタンハンドラだけを各ビューアが持ち、
 * フェーズ→表示物の規則はここに一元化する（web/mobile の演出乖離を防ぐ）。
 * prevKifu は draw 段階で見せる1手前の局面（playbackKifu(kifu, shown-1)）。
 * ツモ和了牌は viewKifu の時点で手牌から抜かれており（buildPlaybackFrame）、
 * winDraw フェーズ（次ボタンで明示的にツモる半歩）で初めて右端スロットにフライインする
 * （末尾へのジャンプ・初期の全表示では出さない）。
 */
export function stepDisplay(
  phase: StepPhase | null,
  frame: PlaybackFrame,
  prevKifu: Kifu | null,
): StepDisplay {
  const stepDraw = activeDrawnTile(frame.playback);
  const drawing = phase === "draw" && stepDraw !== null && prevKifu !== null;
  const discard = frame.playback.activeDiscard;
  return {
    // prevKifu は素の kifu から導出されるため、viewKifu と同様にツモ和了牌を手牌から抜く
    //（timeline あり＋和了牌が手牌に混ざったデータで draw 半歩中だけ14枚に戻るのを防ぐ）。
    kifu: drawing ? withoutTsumoWinInHand(prevKifu, frame.tsumoWin) : frame.viewKifu,
    drawnTile: drawing ? stepDraw : phase === "winDraw" ? frame.tsumoWin : null,
    animateDiscard:
      phase === "drop" && discard ? { seat: discard.seat, index: discard.riverIndex } : null,
    drawing,
  };
}

/**
 * ビューア共通の再生フレーム導出。web(KifuViewer)/mobile(KifuPlayer) は再生位置
 * reveal（-1=全表示）だけを状態に持ち、描画に使う値はすべてここから得る
 * （両プラットフォームの再生挙動を構造的に一致させるための一枚岩）。
 */
export function buildPlaybackFrame(args: {
  kifu: Kifu;
  /** 同じ半荘の直前までの局（開始持ち点の算出に使う）。 */
  prevKifus: Kifu[];
  /** 再生位置（打牌数）。-1 は全表示。 */
  reveal: number;
  /** 視点席（手前に置く席）。指定時は牌譜の cameraBottomSeat より優先する。
   *  表示上の回転のみで、親・巡目・再生の進行には影響しない。 */
  povSeat?: Seat | null;
}): PlaybackFrame {
  const { kifu, prevKifus, reveal, povSeat } = args;
  const bottomSeat: Seat = povSeat ?? kifu.cameraBottomSeat ?? "east";
  const dealer: Seat = kifu.meta.dealer ?? bottomSeat;
  const river = buildRiverPlayback(kifu, dealer);
  const shown = reveal < 0 || reveal > river.order.length ? river.order.length : reveal;
  const playback = buildPlaybackState(kifu, shown);
  const atEnd = river.order.length > 0 && reveal >= river.order.length;
  const tsumoWin = tsumoWinDisplay(kifu);
  return {
    ...river,
    bottomSeat,
    dealer,
    shown,
    curJunme: Math.max(1, revealCounts(river.order, shown)[dealer]),
    startPoints: standings(prevKifus, kifu.rules),
    playback,
    // ツモ和了牌はここで手牌から抜く。viewKifu の全消費者（卓面・和了シート・情報パネル）で
    // 一貫して「winDraw 半歩まで手牌に混ぜない」を成立させる。draw 半歩の prevKifu 経路は
    // 除去しないが、除去対象のスナップショット手牌（timeline 空）では draw 半歩自体が
    // 発生しない（stepHasDraw が常に false）ため実害はない。
    viewKifu: withoutTsumoWinInHand(playbackStateToKifu(kifu, playback), tsumoWin),
    atEnd,
    tsumoWin,
  };
}

/** ツモ和了牌を手牌本体から1枚抜いた盤面を返す（スナップショット手牌=和了牌込み14枚型のみ
 *  実枚数が変わる。編集済13枚型・ロン・和了なしは無変更。同種複数でも抜くのは1枚）。 */
function withoutTsumoWinInHand(kifu: Kifu, win: DrawnTile | null): Kifu {
  if (!win) return kifu;
  const hand = kifu.seats[win.seat].hand;
  const i = hand.findIndex((t) => t.tile === win.tile);
  if (i < 0) return kifu;
  return {
    ...kifu,
    seats: {
      ...kifu.seats,
      [win.seat]: { ...kifu.seats[win.seat], hand: hand.filter((_, idx) => idx !== i) },
    },
  };
}
