// @rigel/ui — 手順（タイムライン）の純粋ロジック（プラットフォーム非依存）。
// timeline を正典とし、盤面(席ごと river/melds)と巡目をここから導出する。
// 既存牌譜(timeline 無し)は席ごとから輪番仮定で構築する（段階移行）。
// 設計: docs/designs/timeline-editor.md

import {
  KifuSchema,
  type Discard,
  type DiscardEvent,
  type Kifu,
  type Meld,
  type MeldType,
  type Seat,
  type Tile,
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
        calledBy: d.calledBy,
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

/** 手入力の打牌イベント（手出し・確定扱い）。＋打牌や鳴き直後の打牌行の生成で共用する。 */
export function makeDiscardEvent(seat: Seat, tile: Tile | null = null): DiscardEvent {
  return {
    kind: "discard",
    seat,
    draw: null,
    tile,
    tsumogiri: false,
    riichi: false,
    calledBy: null,
    confidence: 1,
  };
}

/**
 * 手順に打牌を追加するときの席。既存の打牌数に応じて「親起点の東南西北」を順に埋める
 * （1巡が埋まったら次巡の1打目＝親へ回る）。鳴きは席サイクルに数えない（打牌のみで回す）。
 * これで「＋打牌」が必ず新巡目・親（東）にならず、東南西北×巡目の自然な並びで足せる。
 */
export function nextDiscardSeat(timeline: TimelineEvent[], dealer: Seat): Seat {
  const order = seatsFromDealer(dealer);
  const discardCount = timeline.filter((e) => e.kind === "discard").length;
  return order[discardCount % 4]!;
}

/**
 * 盤面（seats）を編集した後、timeline を「打牌＝東南西北×巡目順」に正規化して同期する。
 * ------------------------------------------------------------
 * 盤面編集は seats(river/melds) を直接触るため、timeline が非空だと古いまま残り
 * 手順ナビに反映されない／保存時に消える。これを防ぐため:
 *   - 打牌は seats から巡目インターリーブ（buildTimelineFromSeats と同じ順）で作り直す。
 *   - 旧 timeline のツモ牌(draw)は「席＋席内index」で新打牌へ引き継ぐ（timeline 固有情報の保全）。
 *   - 鳴きは「旧 timeline で直前にあった打牌（席＋席内index）」をアンカーに、打牌再整列後も
 *     その直後へ再挿入する（アンカー打牌が消えた鳴きは末尾へ退避）。
 * timeline が空（新規牌譜）のときは何もしない（deriveTimeline が seats から巡目順に導出する）。
 */
export function reconcileTimeline(kifu: Kifu): Kifu {
  if (kifu.timeline.length === 0) return kifu;
  const dealer = kifu.meta.dealer ?? "east";
  const order = seatsFromDealer(dealer);

  // 旧 timeline の打牌を「席→席内index順の配列」に畳む（draw 引き継ぎ用の索引）。
  const oldDrawsBySeat: Record<Seat, (Tile | null)[]> = {
    east: [],
    south: [],
    west: [],
    north: [],
  };
  for (const e of kifu.timeline) {
    if (e.kind === "discard") oldDrawsBySeat[e.seat].push(e.draw);
  }

  // 1. seats から巡目インターリーブで打牌イベントを再生成（draw は席内 index で引き継ぐ）。
  const discards: TimelineEvent[] = [];
  const seatCount: Record<Seat, number> = { east: 0, south: 0, west: 0, north: 0 };
  const maxLen = Math.max(0, ...order.map((s) => kifu.seats[s].river.length));
  for (let t = 0; t < maxLen; t++) {
    for (const seat of order) {
      const d = kifu.seats[seat].river[t];
      if (!d) continue;
      const idx = seatCount[seat]++;
      discards.push({
        kind: "discard",
        seat,
        draw: oldDrawsBySeat[seat][idx] ?? null,
        tile: d.tile,
        tsumogiri: d.tsumogiri,
        riichi: d.riichi,
        // 鳴かれた印は盤面（seats.river）が編集面なのでそのまま採用する。
        calledBy: d.calledBy,
        confidence: d.confidence,
      });
    }
  }

  // 2. 鳴きの内容は seats.melds（＝盤面の編集面。牌変更もここに反映済み）から取り、
  //    位置（アンカー）は旧 timeline の鳴きイベントから席×鳴きindexで引き継ぐ。
  //    アンカー = 旧 timeline でその鳴きの直前にあった打牌の「席＋席内index」。
  //    先頭（打牌より前）は "front"、旧アンカーが無い新規鳴きは "end"（末尾＝最新）。
  type Anchor = { seat: Seat; idx: number } | "front" | "end";
  const oldMeldAnchors: Record<Seat, Anchor[]> = { east: [], south: [], west: [], north: [] };
  {
    const seen: Record<Seat, number> = { east: 0, south: 0, west: 0, north: 0 };
    let lastDiscard: { seat: Seat; idx: number } | null = null;
    for (const e of kifu.timeline) {
      if (e.kind === "discard") lastDiscard = { seat: e.seat, idx: seen[e.seat]++ };
      else oldMeldAnchors[e.seat].push(lastDiscard ?? "front");
    }
  }
  type Placed = { meld: Meld; seat: Seat; anchor: Anchor };
  const melds: Placed[] = [];
  for (const seat of SEAT_ORDER) {
    kifu.seats[seat].melds.forEach((meld, k) => {
      melds.push({ meld, seat, anchor: oldMeldAnchors[seat][k] ?? "end" });
    });
  }

  // 3. 打牌列にアンカー位置で鳴きを差し込む（アンカー打牌が消えた鳴きは末尾へ退避）。
  const keyOf = (seat: Seat, idx: number) => `${seat}:${idx}`;
  const survivingKeys = new Set<string>();
  {
    const c: Record<Seat, number> = { east: 0, south: 0, west: 0, north: 0 };
    for (const d of discards)
      if (d.kind === "discard") survivingKeys.add(keyOf(d.seat, c[d.seat]++));
  }
  const afterKey = new Map<string, TimelineEvent[]>();
  const atFront: TimelineEvent[] = [];
  const atEnd: TimelineEvent[] = [];
  const push = (map: Map<string, TimelineEvent[]>, k: string, ev: TimelineEvent) =>
    (map.get(k) ?? map.set(k, []).get(k)!).push(ev);
  for (const { meld, seat, anchor } of melds) {
    const ev: TimelineEvent = { kind: "meld", seat, meld };
    if (anchor === "front") atFront.push(ev);
    else if (anchor === "end") atEnd.push(ev);
    else if (survivingKeys.has(keyOf(anchor.seat, anchor.idx)))
      push(afterKey, keyOf(anchor.seat, anchor.idx), ev);
    else atEnd.push(ev);
  }

  const result: TimelineEvent[] = [...atFront];
  const c: Record<Seat, number> = { east: 0, south: 0, west: 0, north: 0 };
  for (const d of discards) {
    result.push(d);
    if (d.kind === "discard") {
      for (const m of afterKey.get(keyOf(d.seat, c[d.seat]++)) ?? []) result.push(m);
    }
  }
  result.push(...atEnd);

  // timeline を正典として seats(river/melds) も同期（hand は保持）。
  return syncSeatsFromTimeline(KifuSchema.parse({ ...kifu, timeline: result }));
}

/**
 * 鳴きイベントの from（鳴き元）の設定/変更/削除に、鳴き印（打牌の calledBy）を追随させる。
 * 規則は再生と同じ「鳴きは、その位置より前にある鳴き元の直近の打牌を取る」:
 *   - oldFrom の直近の打牌のうち calledBy=caller のものを解除（他の鳴き主の印は壊さない）
 *   - newFrom の直近の打牌に calledBy=caller を付ける（null なら解除のみ＝削除・暗槓化）
 * meldIndex は鳴きイベントの位置（削除時は削除前の位置）。手順タブの from 編集・行削除で使う。
 */
export function syncCalledByForMeld(
  timeline: TimelineEvent[],
  meldIndex: number,
  caller: Seat,
  oldFrom: Seat | null,
  newFrom: Seat | null,
): TimelineEvent[] {
  const next = timeline.slice();
  const markNearest = (from: Seat, calledBy: Seat | null, onlyCaller: boolean) => {
    for (let i = Math.min(meldIndex, next.length) - 1; i >= 0; i--) {
      const e = next[i]!;
      if (e.kind !== "discard" || e.seat !== from) continue;
      if (onlyCaller && e.calledBy !== caller) return; // 直近の打牌が別の鳴き主の印なら触らない
      next[i] = { ...e, calledBy };
      return;
    }
  };
  if (oldFrom && oldFrom !== newFrom) markNearest(oldFrom, null, true);
  if (newFrom) markNearest(newFrom, caller, false);
  return next;
}

// ------------------------------------------------------------
// 手順イベントの共通操作（web/mobile の手順タブで共用。鳴き印の追随込み）
// ------------------------------------------------------------

/** 席の順送り（次の席）。手順タブの席ボタンで使う。 */
export function nextSeatOf(seat: Seat): Seat {
  return SEAT_ORDER[(SEAT_ORDER.indexOf(seat) + 1) % 4]!;
}

/** 鳴き元の順送り（自席は飛ばす）。 */
export function nextMeldFrom(from: Seat | null, self: Seat): Seat {
  let i = SEAT_ORDER.indexOf(from ?? self);
  do {
    i = (i + 1) % 4;
  } while (SEAT_ORDER[i] === self);
  return SEAT_ORDER[i]!;
}

/** 鳴き種別の巡回順（手順タブの種別ボタン）。 */
const MELD_TYPE_CYCLE: MeldType[] = ["pon", "chi", "kan_open", "kan_closed", "kan_added"];
const isKanType = (t: MeldType) => t === "kan_open" || t === "kan_closed" || t === "kan_added";

/** 鳴きの from を順送りし、鳴き印（鳴き元の直前の打牌の calledBy）も追随させる。 */
export function cycleMeldFrom(timeline: TimelineEvent[], index: number): TimelineEvent[] {
  const e = timeline[index];
  if (e?.kind !== "meld") return timeline;
  const oldFrom = e.meld.from;
  const newFrom = nextMeldFrom(oldFrom, e.seat);
  const next = timeline.map((ev, k) =>
    k === index && ev.kind === "meld" ? { ...ev, meld: { ...ev.meld, from: newFrom } } : ev,
  );
  return syncCalledByForMeld(next, index, e.seat, oldFrom, newFrom);
}

/** 鳴き種別を順送り（枚数を合わせ、暗槓は from=null）。from が変われば鳴き印も追随させる。 */
export function cycleMeldType(timeline: TimelineEvent[], index: number): TimelineEvent[] {
  const e = timeline[index];
  if (e?.kind !== "meld") return timeline;
  const type =
    MELD_TYPE_CYCLE[(MELD_TYPE_CYCLE.indexOf(e.meld.type) + 1) % MELD_TYPE_CYCLE.length]!;
  const n = isKanType(type) ? 4 : 3;
  const tiles = Array.from(
    { length: n },
    (_, k) => e.meld.tiles[k] ?? e.meld.tiles[0] ?? { tile: null, confidence: 1 },
  );
  const oldFrom = e.meld.from;
  const from = type === "kan_closed" ? null : (e.meld.from ?? nextMeldFrom(null, e.seat));
  const next = timeline.map((ev, k) =>
    k === index && ev.kind === "meld" ? { ...ev, meld: { type, tiles, from } } : ev,
  );
  return from === oldFrom ? next : syncCalledByForMeld(next, index, e.seat, oldFrom, from);
}

/** 席の順送り。鳴き行は鳴き印の主も付け替える。 */
export function cycleEventSeat(timeline: TimelineEvent[], index: number): TimelineEvent[] {
  const e = timeline[index];
  if (!e) return timeline;
  const newSeat = nextSeatOf(e.seat);
  if (e.kind === "meld" && e.meld.from) {
    let next = syncCalledByForMeld(timeline, index, e.seat, e.meld.from, null);
    next = next.map((ev, k) => (k === index ? { ...ev, seat: newSeat } : ev));
    return syncCalledByForMeld(next, index, newSeat, null, e.meld.from);
  }
  return timeline.map((ev, k) => (k === index ? { ...ev, seat: newSeat } : ev));
}

/** 行の削除。鳴き行なら鳴き印も解除する。 */
export function removeTimelineEvent(timeline: TimelineEvent[], index: number): TimelineEvent[] {
  const e = timeline[index];
  const base =
    e?.kind === "meld" && e.meld.from
      ? syncCalledByForMeld(timeline, index, e.seat, e.meld.from, null)
      : timeline;
  return base.filter((_, k) => k !== index);
}

/**
 * 手順タブの「鳴き」操作。打牌 index の鳴き印（calledBy）を caller に付け替え、
 * 連動行（直後の鳴き行と、その直後の鳴いた人の未入力打牌行）を追随させる。
 *  - なし→席: 印を付け、直後に鳴き行（ポン・鳴かれた牌×3・from=捨て主）と
 *    鳴いた人の打牌行（tile=null。何を切ったかは後で選ぶ）を挿入する
 *  - 席→別席: 印と連動行の席を付け替える（鳴き種別・牌のユーザー編集は保つ）
 *  - 席→なし: 印を解除し連動行を取り除く（牌の入った打牌行はユーザー入力なので残す）
 */
export function setTimelineCall(
  timeline: TimelineEvent[],
  index: number,
  caller: Seat | null,
): TimelineEvent[] {
  const e = timeline[index];
  if (e?.kind !== "discard" || e.calledBy === caller) return timeline;
  const old = e.calledBy;
  const next = timeline.slice();
  next[index] = { ...e, calledBy: caller };

  // 連動行の特定: 直後の鳴き行（from=この打牌の席・鳴き主=旧印）と、その直後の未入力打牌行。
  const meldAt = index + 1;
  const m = old ? next[meldAt] : undefined;
  const linkedMeld = m?.kind === "meld" && m.meld.from === e.seat && m.seat === old ? m : null;
  const d2 = linkedMeld ? next[meldAt + 1] : undefined;
  const linkedEmpty = d2?.kind === "discard" && d2.seat === old && d2.tile === null ? d2 : null;

  if (caller === null) {
    if (linkedMeld) next.splice(meldAt, linkedEmpty ? 2 : 1);
    return next;
  }
  if (old === null) {
    const shape: (Tile | null)[] = e.tile ? [e.tile, e.tile, e.tile] : [null, null, null];
    next.splice(
      meldAt,
      0,
      {
        kind: "meld",
        seat: caller,
        meld: { type: "pon", tiles: shape.map((t) => ({ tile: t, confidence: 1 })), from: e.seat },
      },
      makeDiscardEvent(caller),
    );
    return next;
  }
  if (linkedMeld) next[meldAt] = { ...linkedMeld, seat: caller };
  if (linkedEmpty) next[meldAt + 1] = { ...linkedEmpty, seat: caller };
  return next;
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
        calledBy: e.calledBy,
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
