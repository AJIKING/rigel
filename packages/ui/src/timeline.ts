// @rigel/ui — 手順（タイムライン）の純粋ロジック（プラットフォーム非依存）。
// timeline を正典とし、盤面(席ごと river/melds)と巡目をここから導出する。
// 既存牌譜(timeline 無し)は席ごとから輪番仮定で構築する（段階移行）。
// 設計: docs/designs/timeline-editor.md

import {
  KifuSchema,
  type Discard,
  type Kifu,
  type Meld,
  type Seat,
  type TimelineEvent,
} from "@rigel/schema";

const SEAT_ORDER: Seat[] = ["east", "south", "west", "north"];

/** 親起点の席順（親→下家→対面→上家 = 東南西北の並びを dealer から回す）。 */
function seatsFromDealer(dealer: Seat): Seat[] {
  const i = SEAT_ORDER.indexOf(dealer);
  return [0, 1, 2, 3].map((k) => SEAT_ORDER[(i + k) % 4]!);
}

/**
 * 既存の席ごと river/melds から輪番仮定でタイムラインを組む（移行用）。
 * 各巡は親→下家→対面→上家の順に、その巡の打牌があれば並べる。
 * 鳴きは順序が復元不能なため末尾に付す（ユーザーが手順タブで手直しする前提）。
 */
export function buildTimelineFromSeats(kifu: Kifu): TimelineEvent[] {
  const dealer = kifu.meta.dealer ?? "east";
  const order = seatsFromDealer(dealer);
  const events: TimelineEvent[] = [];
  const maxLen = Math.max(0, ...order.map((s) => kifu.seats[s].river.length));
  for (let t = 0; t < maxLen; t++) {
    for (const seat of order) {
      const d = kifu.seats[seat].river[t];
      if (!d) continue;
      events.push({
        kind: "discard",
        seat,
        draw: null,
        tile: d.tile,
        tsumogiri: d.tsumogiri,
        riichi: d.riichi,
        confidence: d.confidence,
      });
    }
  }
  for (const seat of order) {
    for (const meld of kifu.seats[seat].melds) events.push({ kind: "meld", seat, meld });
  }
  return events;
}

/** kifu が timeline を持てばそれを、無ければ席ごとから構築して返す。 */
export function deriveTimeline(kifu: Kifu): TimelineEvent[] {
  return kifu.timeline.length > 0 ? kifu.timeline : buildTimelineFromSeats(kifu);
}

/** 各イベントの巡目（親の打牌ごとに +1）。timeline と同じ長さの配列を返す。 */
export function timelineTurns(timeline: TimelineEvent[], dealer: Seat): number[] {
  let turn = 0;
  return timeline.map((e) => {
    if (e.kind === "discard" && e.seat === dealer) turn++;
    return Math.max(1, turn);
  });
}

type SeatRivers = Record<Seat, { river: Discard[]; melds: Meld[] }>;

/** timeline から席ごとの river/melds を導出（盤面同期用）。order は席内で振り直す。 */
export function timelineToSeats(timeline: TimelineEvent[]): SeatRivers {
  const out: SeatRivers = {
    east: { river: [], melds: [] },
    south: { river: [], melds: [] },
    west: { river: [], melds: [] },
    north: { river: [], melds: [] },
  };
  const count: Record<Seat, number> = { east: 0, south: 0, west: 0, north: 0 };
  for (const e of timeline) {
    if (e.kind === "discard") {
      out[e.seat].river.push({
        order: ++count[e.seat],
        tile: e.tile,
        riichi: e.riichi,
        tsumogiri: e.tsumogiri,
        confidence: e.confidence,
      });
    } else {
      out[e.seat].melds.push(e.meld);
    }
  }
  return out;
}

/** timeline を正典として kifu.seats(river/melds) を同期した新 Kifu を返す（hand は保持）。 */
export function syncSeatsFromTimeline(kifu: Kifu): Kifu {
  const d = timelineToSeats(kifu.timeline);
  return KifuSchema.parse({
    ...kifu,
    seats: {
      east: { ...kifu.seats.east, river: d.east.river, melds: d.east.melds },
      south: { ...kifu.seats.south, river: d.south.river, melds: d.south.melds },
      west: { ...kifu.seats.west, river: d.west.river, melds: d.west.melds },
      north: { ...kifu.seats.north, river: d.north.river, melds: d.north.melds },
    },
  });
}
