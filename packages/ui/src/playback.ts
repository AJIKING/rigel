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

function applyMeld(board: SeatBoard, event: Extract<TimelineEvent, { kind: "meld" }>): void {
  board.melds.push(event.meld);
  const used = MELD_HAND_USED[event.meld.type];
  for (const t of event.meld.tiles.slice(0, used)) removeOne(board.hand, t.tile);
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

  const discard = toDiscard(event, board.river.length + 1);
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
      applyMeld(seats[event.seat], event);
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
 *  drop=打牌が河へ落ち手牌が理牌される。null=半歩なし（初期表示・ジャンプ）。
 *  進む/戻るボタンが半歩ずつ刻む（ツモる→捨てる。タイマーでは進めない）。 */
export type StepPhase = "draw" | "drop";
/** 末尾到達（atEnd）から和了ダイアログ表示までの遅延。最後の演出
 *  （ロン=打牌の drop / ツモ=和了牌のフライイン）を見せ切ってから開く。 */
export const AGARI_DELAY_MS = 900;

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
 * 手牌にその牌がある（スナップショットのツモ和了牌）なら該当1枚を本体から抜き、
 * 無い（編集済の最終手牌／再生中の一時ツモ）なら本体そのまま＋14枚目として返す。
 */
export function splitDrawnTile(
  hand: ReadTile[],
  drawn: DrawnTile | null,
  seat: Seat,
): { hand: ReadTile[]; drawnTile: Tile | null } {
  const sorted = sortHandTiles(hand);
  if (!drawn || drawn.seat !== seat) return { hand: sorted, drawnTile: null };
  const i = sorted.findIndex((t) => t.tile === drawn.tile);
  return {
    hand: i >= 0 ? sorted.filter((_, idx) => idx !== i) : sorted,
    drawnTile: drawn.tile,
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
  /** ツモ和了牌（手牌の横に離して描く）。再生で末尾に達したとき（=atEnd）だけ非 null。
   *  和了演出と同じ発火条件で、初期の全表示（reveal=-1）では出さない。 */
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
  /** 手牌右端スロットの1枚。draw 段階=一時ツモ牌、それ以外=末尾のツモ和了牌。 */
  drawnTile: DrawnTile | null;
  /** drop 演出を付ける河の1枚。drop 段階だけ。 */
  animateDiscard: { seat: Seat; index: number } | null;
  /** draw 段階（盤面が1手前）を表示中か。和了ダイアログの発火抑制に使う。 */
  drawing: boolean;
}

/**
 * 二段階ステップ演出の表示導出。フェーズのタイマー（draw→drop 遷移）だけを各ビューアが
 * 持ち、フェーズ→表示物の規則はここに一元化する（web/mobile の演出乖離を防ぐ）。
 * prevKifu は draw 段階で見せる1手前の局面（playbackKifu(kifu, shown-1)）。
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
    kifu: drawing ? prevKifu : frame.viewKifu,
    drawnTile: drawing ? stepDraw : frame.tsumoWin,
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
}): PlaybackFrame {
  const { kifu, prevKifus, reveal } = args;
  const bottomSeat: Seat = kifu.cameraBottomSeat ?? "east";
  const dealer: Seat = kifu.meta.dealer ?? bottomSeat;
  const river = buildRiverPlayback(kifu, dealer);
  const shown = reveal < 0 || reveal > river.order.length ? river.order.length : reveal;
  const playback = buildPlaybackState(kifu, shown);
  const atEnd = river.order.length > 0 && reveal >= river.order.length;
  return {
    ...river,
    bottomSeat,
    dealer,
    shown,
    curJunme: Math.max(1, revealCounts(river.order, shown)[dealer]),
    startPoints: standings(prevKifus, kifu.rules),
    playback,
    viewKifu: playbackStateToKifu(kifu, playback),
    atEnd,
    tsumoWin: atEnd ? tsumoWinDisplay(kifu) : null,
  };
}
