import {
  KifuSchema,
  type Discard,
  type Kifu,
  type ReadTile,
  type Seat,
  type SeatBoard,
  type Tile,
  type TimelineEvent,
} from "@rigel/schema";
import { deriveTimeline } from "./timeline";

export interface PlaybackState {
  /** そのステップ時点の盤面（手牌の再構成は編集済のみ。下記 morph を参照）。 */
  seats: Kifu["seats"];
  /** 局開始時の供託 + 再生済みリーチ宣言（リーチ棒の増加）。 */
  kyotaku: number;
  /** 直近で適用したツモ。描画側のツモ演出に使う。不明・未編集なら null。 */
  activeDraw: { seat: Seat; tile: Tile | null } | null;
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

/** 未編集（AI/スナップショット）用: 手牌を触らず打牌だけ河へ積む。 */
function pushRiverOnly(board: SeatBoard, event: Extract<TimelineEvent, { kind: "discard" }>): void {
  board.river.push({
    order: board.river.length + 1,
    tile: event.tile,
    riichi: event.riichi,
    tsumogiri: event.tsumogiri,
    confidence: event.confidence,
  });
}

function removeOne(hand: ReadTile[], tile: Tile | null): void {
  if (tile === null) return;
  const i = hand.findIndex((t) => t.tile === tile);
  if (i >= 0) hand.splice(i, 1);
}

function pushDraw(hand: ReadTile[], tile: Tile | null, confidence: number): void {
  if (tile !== null) hand.push({ tile, confidence });
}

function applyMeld(board: SeatBoard, event: Extract<TimelineEvent, { kind: "meld" }>): void {
  board.melds.push(event.meld);

  const used =
    event.meld.type === "chi" || event.meld.type === "pon"
      ? 2
      : event.meld.type === "kan_open"
        ? 3
        : event.meld.type === "kan_closed"
          ? 4
          : 1;

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

  const discard: Discard = {
    order: board.river.length + 1,
    tile: event.tile,
    riichi: event.riichi,
    tsumogiri: event.tsumogiri,
    confidence: event.confidence,
  };
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
  let shown = 0;

  for (const event of timeline) {
    if (shown >= shownDiscards) break; // 要求した打牌数に達したら止める（後続の鳴きも待つ）。
    if (event.kind === "discard") {
      if (morph) applyDiscard(seats[event.seat], event);
      else pushRiverOnly(seats[event.seat], event);
      shown += 1;
      activeDraw = morph && event.draw !== null ? { seat: event.seat, tile: event.draw } : null;
      if (event.riichi) kyotaku += 1; // リーチ宣言＝リーチ棒（供託）+1。
    } else if (morph) {
      applyMeld(seats[event.seat], event);
      activeDraw = null;
    }
  }

  return { seats, kyotaku, activeDraw };
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
