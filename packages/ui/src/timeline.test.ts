import { KifuSchema, type Kifu, type TimelineEvent } from "@rigel/schema";
import { describe, expect, it } from "vitest";
import { callDiscard, discardCallOf } from "./edit";
import {
  buildTimelineFromSeats,
  cycleEventSeat,
  cycleMeldFrom,
  cycleMeldType,
  deriveTimeline,
  nextDiscardSeat,
  moveTimelineRow,
  reconcileTimeline,
  removeTimelineEvent,
  removeTimelineRow,
  setMeldDiscard,
  setTimelineCall,
  syncCalledByForMeld,
  syncSeatsFromTimeline,
  timelineRows,
  timelineToSeats,
  timelineTurns,
} from "./timeline";

/** テスト用: 河の1牌（order は呼び出し側で連番指定）。 */
const river = (
  order: number,
  tile: string,
  extra: { riichi?: boolean; tsumogiri?: boolean } = {},
) => ({
  order,
  tile: tile as never,
  riichi: extra.riichi ?? false,
  tsumogiri: extra.tsumogiri ?? false,
  confidence: 1,
});
const pon = (from: string) => ({
  type: "pon" as const,
  tiles: [
    { tile: "5z" as never, confidence: 1 },
    { tile: "5z" as never, confidence: 1 },
    { tile: "5z" as never, confidence: 1 },
  ],
  from: from as never,
});
const discKinds = (k: { timeline: unknown[] }) =>
  (k.timeline as { kind: string; seat: string; tile?: string }[])
    .filter((e) => e.kind === "discard")
    .map((e) => `${e.seat}:${e.tile}`);

const kifu = (over: Record<string, unknown> = {}): Kifu =>
  KifuSchema.parse({
    schemaVersion: "1.0.0",
    capturedAt: "2026-06-28T00:00:00.000Z",
    seats: { east: {}, south: {}, west: {}, north: {} },
    ...over,
  });

const disc = (
  seat: TimelineEvent["seat"],
  tile: string,
): Extract<TimelineEvent, { kind: "discard" }> => ({
  kind: "discard",
  seat,
  draw: null,
  tile: tile as never,
  tsumogiri: false,
  riichi: false,
  calledBy: null,
  confidence: 1,
});

describe("buildTimelineFromSeats（席ごと→輪番タイムライン移行）", () => {
  it("親起点の輪番（東→南→西→北）で打牌を並べる", () => {
    const k = kifu({
      meta: { dealer: "east" },
      seats: {
        east: {
          hand: [],
          melds: [],
          river: [{ order: 1, tile: "1m", riichi: false, tsumogiri: false, confidence: 1 }],
        },
        south: {
          hand: [],
          melds: [],
          river: [{ order: 1, tile: "2p", riichi: false, tsumogiri: false, confidence: 1 }],
        },
        west: { hand: [], melds: [], river: [] },
        north: { hand: [], melds: [], river: [] },
      },
    });
    const tl = buildTimelineFromSeats(k);
    expect(tl.map((e) => e.kind === "discard" && `${e.seat}:${e.tile}`)).toEqual([
      "east:1m",
      "south:2p",
    ]);
  });
});

describe("deriveTimeline", () => {
  it("timeline があればそれを返す", () => {
    const tl = [disc("east", "1m")];
    expect(deriveTimeline(kifu({ timeline: tl }))).toEqual(tl);
  });
  it("timeline が空なら席ごとから構築する", () => {
    const k = kifu({
      seats: {
        east: {
          hand: [],
          melds: [],
          river: [{ order: 1, tile: "1m", riichi: false, tsumogiri: false, confidence: 1 }],
        },
        south: {},
        west: {},
        north: {},
      },
    });
    expect(deriveTimeline(k)).toHaveLength(1);
  });
});

describe("timelineTurns（巡目=親の打牌ごとに+1）", () => {
  it("親の打牌のたびに巡目が上がる", () => {
    const tl = [disc("east", "1m"), disc("south", "2p"), disc("east", "3s"), disc("west", "4m")];
    expect(timelineTurns(tl, "east")).toEqual([1, 1, 2, 2]);
  });
});

describe("timelineToSeats / syncSeatsFromTimeline", () => {
  it("timeline から席ごと river/melds を導出し order を振り直す", () => {
    const tl = [disc("east", "1m"), disc("east", "2m")];
    const seats = timelineToSeats(tl);
    expect(seats.east.river.map((d) => `${d.order}:${d.tile}`)).toEqual(["1:1m", "2:2m"]);
  });
  it("hand は保持したまま river/melds を同期する", () => {
    const k = kifu({
      seats: {
        east: { hand: [{ tile: "5z", confidence: 1 }], melds: [], river: [] },
        south: {},
        west: {},
        north: {},
      },
      timeline: [disc("east", "1m")],
    });
    const synced = syncSeatsFromTimeline(k);
    expect(synced.seats.east.hand).toHaveLength(1); // 手牌は残る
    expect(synced.seats.east.river.map((d) => d.tile)).toEqual(["1m"]);
  });

  it("リーチ(横向き)と鳴きが timeline→盤面へ同期される", () => {
    const k = kifu({
      timeline: [
        {
          kind: "discard",
          seat: "east",
          draw: null,
          tile: "1z",
          tsumogiri: false,
          riichi: true,
          confidence: 1,
        },
        {
          kind: "meld",
          seat: "south",
          meld: {
            type: "pon",
            tiles: [{ tile: "5z" }, { tile: "5z" }, { tile: "5z" }],
            from: "east",
          },
        },
      ],
    });
    const synced = syncSeatsFromTimeline(k);
    // リーチ牌は river に riichi:true で入る → 盤面は lay(横向き)で描画。
    expect(synced.seats.east.river[0]).toMatchObject({ tile: "1z", riichi: true });
    // 鳴きは melds に入る → 盤面は melds を描画。
    expect(synced.seats.south.melds[0]).toMatchObject({ type: "pon", from: "east" });
  });
});

describe("鳴かれた捨て牌（calledBy）の往復", () => {
  it("timeline→盤面: 打牌イベントの calledBy が river へ同期される", () => {
    const k = kifu({
      timeline: [{ ...disc("east", "5p"), calledBy: "south" }, disc("south", "1m")],
    });
    const synced = syncSeatsFromTimeline(k);
    expect(synced.seats.east.river[0]).toMatchObject({ tile: "5p", calledBy: "south" });
    expect(synced.seats.south.river[0]).toMatchObject({ tile: "1m", calledBy: null });
  });

  it("盤面→timeline: buildTimelineFromSeats が river の calledBy を引き継ぐ", () => {
    const k = kifu({
      seats: {
        east: { river: [{ ...river(1, "5p"), calledBy: "south" }] },
        south: {},
        west: {},
        north: {},
      },
    });
    const tl = buildTimelineFromSeats(k);
    expect(tl[0]).toMatchObject({ kind: "discard", seat: "east", tile: "5p", calledBy: "south" });
  });

  it("reconcileTimeline: 盤面編集後も river の calledBy が timeline に保たれる", () => {
    const k = kifu({
      seats: {
        east: { river: [{ ...river(1, "5p"), calledBy: "south" }] },
        south: {},
        west: {},
        north: {},
      },
      timeline: [disc("east", "5p")], // 旧 timeline は calledBy なし（seats 側が編集面）
    });
    const next = reconcileTimeline(k);
    const first = next.timeline[0];
    if (first?.kind !== "discard") throw new Error("discard expected");
    expect(first.calledBy).toBe("south");
    expect(next.seats.east.river[0]?.calledBy).toBe("south");
  });
});

describe("syncCalledByForMeld（鳴きの from 変更/削除に鳴き印を追随させる）", () => {
  const pon5p = (from: string) => ({
    type: "pon" as const,
    tiles: [
      { tile: "5p" as never, confidence: 1 },
      { tile: "5p" as never, confidence: 1 },
      { tile: "5p" as never, confidence: 1 },
    ],
    from: from as never,
  });

  it("newFrom の直前の打牌に鳴き印を付け、oldFrom の印は解除する", () => {
    const tl: TimelineEvent[] = [
      { ...disc("east", "5p"), calledBy: "south" }, // 旧 from=east の印
      disc("west", "1m"),
      { kind: "meld", seat: "south", meld: pon5p("west") }, // from を east→west に変えた後
    ];
    const next = syncCalledByForMeld(tl, 2, "south", "east", "west");
    const [a, b] = next;
    if (a?.kind !== "discard" || b?.kind !== "discard") throw new Error("discard expected");
    expect(a.calledBy).toBeNull(); // 旧鳴き元の印は解除
    expect(b.calledBy).toBe("south"); // 新鳴き元の直前の打牌に印
  });

  it("newFrom=null（削除・暗槓化）は解除だけ行う", () => {
    const tl: TimelineEvent[] = [{ ...disc("east", "5p"), calledBy: "south" }];
    const next = syncCalledByForMeld(tl, 1, "south", "east", null);
    const a = next[0];
    if (a?.kind !== "discard") throw new Error("discard expected");
    expect(a.calledBy).toBeNull();
  });

  it("鳴き主(caller)が違う印は解除しない（別の鳴きの印を壊さない）", () => {
    const tl: TimelineEvent[] = [{ ...disc("east", "5p"), calledBy: "north" }];
    const next = syncCalledByForMeld(tl, 1, "south", "east", null);
    const a = next[0];
    if (a?.kind !== "discard") throw new Error("discard expected");
    expect(a.calledBy).toBe("north");
  });
});

describe("手順イベントの共通操作（cycle*/removeTimelineEvent。web/mobile の手順タブで共用）", () => {
  const pon = (from: string) => ({
    type: "pon" as const,
    tiles: [
      { tile: "5p" as never, confidence: 1 },
      { tile: "5p" as never, confidence: 1 },
      { tile: "5p" as never, confidence: 1 },
    ],
    from: from as never,
  });

  it("cycleMeldFrom は from を順送り（自席は飛ばす）し、鳴き印を追随させる", () => {
    const tl: TimelineEvent[] = [
      disc("east", "5p"),
      { kind: "meld", seat: "south", meld: pon("north") },
    ];
    const next = cycleMeldFrom(tl, 1); // north → east（自席=南は飛ばす）
    const m = next[1];
    if (m?.kind !== "meld") throw new Error("meld expected");
    expect(m.meld.from).toBe("east");
    expect(next[0]).toMatchObject({ kind: "discard", calledBy: "south" });
  });

  it("cycleMeldType で暗槓にすると from が消え、鳴き印も解除される", () => {
    const tl: TimelineEvent[] = [
      { ...disc("east", "5p"), calledBy: "south" },
      { kind: "meld", seat: "south", meld: { ...pon("east"), type: "kan_open" } },
    ];
    const next = cycleMeldType(tl, 1); // kan_open → kan_closed（暗槓）
    const m = next[1];
    if (m?.kind !== "meld") throw new Error("meld expected");
    expect(m.meld.type).toBe("kan_closed");
    expect(m.meld.from).toBeNull();
    expect(m.meld.tiles).toHaveLength(4);
    expect(next[0]).toMatchObject({ kind: "discard", calledBy: null });
  });

  it("cycleEventSeat は鳴き主の変更で鳴き印の主も付け替える", () => {
    const tl: TimelineEvent[] = [
      { ...disc("east", "5p"), calledBy: "south" },
      { kind: "meld", seat: "south", meld: pon("east") },
    ];
    const next = cycleEventSeat(tl, 1); // south → west
    const m = next[1];
    if (m?.kind !== "meld") throw new Error("meld expected");
    expect(m.seat).toBe("west");
    expect(next[0]).toMatchObject({ kind: "discard", calledBy: "west" });
  });

  it("removeTimelineEvent は鳴き行の削除で鳴き印も解除する", () => {
    const tl: TimelineEvent[] = [
      { ...disc("east", "5p"), calledBy: "south" },
      { kind: "meld", seat: "south", meld: pon("east") },
    ];
    const next = removeTimelineEvent(tl, 1);
    expect(next).toHaveLength(1);
    expect(next[0]).toMatchObject({ kind: "discard", calledBy: null });
  });
});

describe("nextDiscardSeat（手順追加時の席＝東南西北×巡目を順に埋める）", () => {
  const d = (seat: TimelineEvent["seat"]) => disc(seat, "1m");

  it("親=東のとき、打牌数に応じて 東→南→西→北→東… と回る", () => {
    expect(nextDiscardSeat([], "east")).toBe("east"); // 1件目=東
    expect(nextDiscardSeat([d("east")], "east")).toBe("south"); // 2件目=南
    expect(nextDiscardSeat([d("east"), d("south")], "east")).toBe("west"); // 3件目=西
    expect(nextDiscardSeat([d("east"), d("south"), d("west")], "east")).toBe("north"); // 4件目=北
    // 1巡が埋まったら次巡の1打目＝東（新巡目）。
    expect(nextDiscardSeat([d("east"), d("south"), d("west"), d("north")], "east")).toBe("east");
  });

  it("親起点で順番が回る（親=南なら 南→西→北→東）", () => {
    expect(nextDiscardSeat([], "south")).toBe("south");
    expect(nextDiscardSeat([d("south")], "south")).toBe("west");
  });

  it("鳴きは席サイクルに数えない（打牌のみで東南西北を回す）", () => {
    const meld = { kind: "meld" as const, seat: "east" as const, meld: pon("north") };
    expect(nextDiscardSeat([d("east"), meld], "east")).toBe("south"); // 打牌1件→次は南
  });
});

describe("reconcileTimeline（盤面編集→timeline を巡目正規化で同期）", () => {
  it("timeline 非空でも打牌は seats から東南西北×巡目順に正規化される", () => {
    // 席ごとに入力した想定（east 2枚・south 1枚）だが、timeline は古い（east 1枚のみ）。
    const k = kifu({
      meta: { dealer: "east" },
      seats: {
        east: { hand: [], melds: [], river: [river(1, "1m"), river(2, "3m")] },
        south: { hand: [], melds: [], river: [river(1, "2p")] },
        west: {},
        north: {},
      },
      timeline: [disc("east", "1m")],
    });
    // 1巡目(east,south)→2巡目(east) の順。south:2p が末尾集中せず巡目位置に入る。
    expect(discKinds(reconcileTimeline(k))).toEqual(["east:1m", "south:2p", "east:3m"]);
  });

  it("再正規化しても旧 timeline のツモ牌(draw)を席内 index で引き継ぐ", () => {
    const k = kifu({
      meta: { dealer: "east" },
      seats: {
        east: { hand: [], melds: [], river: [river(1, "1m")] },
        south: { hand: [], melds: [], river: [river(1, "2p")] },
        west: {},
        north: {},
      },
      timeline: [
        {
          kind: "discard",
          seat: "east",
          draw: "9s",
          tile: "1m",
          tsumogiri: false,
          riichi: false,
          confidence: 1,
        },
      ],
    });
    const out = reconcileTimeline(k).timeline.find(
      (e) => e.kind === "discard" && e.seat === "east",
    );
    expect(out?.kind === "discard" && out.draw).toBe("9s");
  });

  it("鳴きは直前の打牌の後（アンカー）を保って再挿入される", () => {
    // 旧 timeline: east:1m, [pon south], east:3m。south:2p を盤面で足した状態を正規化。
    const k = kifu({
      meta: { dealer: "east" },
      seats: {
        east: { hand: [], melds: [], river: [river(1, "1m"), river(2, "3m")] },
        south: { hand: [], melds: [pon("east")], river: [river(1, "2p")] },
        west: {},
        north: {},
      },
      timeline: [
        disc("east", "1m"),
        { kind: "meld", seat: "south", meld: pon("east") },
        disc("east", "3m"),
      ],
    });
    const kinds = reconcileTimeline(k).timeline.map((e) =>
      e.kind === "discard" ? `d:${e.seat}:${e.tile}` : `m:${e.seat}`,
    );
    // 打牌は巡目順、鳴きは east:1m の直後（アンカー）を保つ。
    expect(kinds).toEqual(["d:east:1m", "m:south", "d:south:2p", "d:east:3m"]);
  });

  it("timeline が空なら何もしない（新規牌譜は buildTimelineFromSeats が既に巡目順）", () => {
    const k = kifu({
      seats: {
        east: { hand: [], melds: [], river: [river(1, "1m")] },
        south: {},
        west: {},
        north: {},
      },
    });
    expect(reconcileTimeline(k).timeline).toEqual([]);
  });
});

describe("setTimelineCall（手順タブの鳴き選択: 鳴いた人を選ぶと鳴き行＋打牌行が入る）", () => {
  it("なし→席: 鳴き印＋鳴き行（ポン・from=捨て主）＋鳴いた人の打牌行（牌は後で選ぶ）を挿入", () => {
    const tl = [disc("east", "5p"), disc("south", "1s")];
    const res = setTimelineCall(tl, 0, "west");
    expect(res).toHaveLength(4);
    expect(res[0]).toMatchObject({ kind: "discard", calledBy: "west" });
    expect(res[1]).toMatchObject({
      kind: "meld",
      seat: "west",
      meld: { type: "pon", from: "east" },
    });
    const meldEv = res[1];
    if (meldEv?.kind !== "meld") throw new Error("meld expected");
    expect(meldEv.meld.tiles.map((t) => t.tile)).toEqual(["5p", "5p", "5p"]);
    expect(res[2]).toMatchObject({ kind: "discard", seat: "west", tile: null });
    expect(res[3]).toMatchObject({ kind: "discard", seat: "south", tile: "1s" });
  });

  it("席→別席: 鳴き印と連動行（鳴き・未入力の打牌）の席を付け替える", () => {
    const tl = setTimelineCall([disc("east", "5p")], 0, "west");
    const res = setTimelineCall(tl, 0, "north");
    expect(res[0]).toMatchObject({ calledBy: "north" });
    expect(res[1]).toMatchObject({ kind: "meld", seat: "north" });
    expect(res[2]).toMatchObject({ kind: "discard", seat: "north", tile: null });
  });

  it("席→なし: 鳴き印を解除し連動行を取り除く（牌の入った打牌行はユーザー入力なので残す）", () => {
    const tl = setTimelineCall([disc("east", "5p")], 0, "west");
    expect(setTimelineCall(tl, 0, null)).toEqual([disc("east", "5p")]);
    const filled = tl.map((e, i) =>
      i === 2 && e.kind === "discard" ? { ...e, tile: "9m" as never } : e,
    );
    const res = setTimelineCall(filled, 0, null);
    expect(res).toHaveLength(2);
    expect(res[0]).toMatchObject({ kind: "discard", calledBy: null });
    expect(res[1]).toMatchObject({ kind: "discard", seat: "west", tile: "9m" });
  });

  it("同じ席を選び直したとき・打牌以外の行は何もしない", () => {
    const tl = setTimelineCall([disc("east", "5p")], 0, "west");
    expect(setTimelineCall(tl, 0, "west")).toBe(tl);
    expect(setTimelineCall(tl, 1, "north")).toBe(tl);
  });
});

describe("reconcileTimeline（打牌の既存順序を保持する）", () => {
  it("鳴きの後の打牌（輪番外の並び）が、盤面編集後も保たれる", () => {
    // 東の5pを西がポン→西が9mを切る→南が1s。輪番（東南西北）ではない並び。
    const base = syncSeatsFromTimeline(
      kifu({
        meta: { dealer: "east" },
        timeline: [
          { ...disc("east", "5p"), calledBy: "west" },
          { kind: "meld", seat: "west", meld: pon("east") },
          disc("west", "9m"),
          disc("south", "1s"),
        ],
      }),
    );
    // 盤面編集で東の河に 2m を足す（addRiverTile 相当）→ reconcile。
    const edited = KifuSchema.parse({
      ...base,
      seats: {
        ...base.seats,
        east: {
          ...base.seats.east,
          river: [...base.seats.east.river, river(2, "2m")],
        },
      },
    });
    const out = reconcileTimeline(edited);
    const kinds = out.timeline.map((e) =>
      e.kind === "discard" ? `d:${e.seat}:${e.tile}` : `m:${e.seat}`,
    );
    // 既存の並び（西→南）は崩れず、新しい打牌（東の2m）は末尾に入る。
    expect(kinds).toEqual(["d:east:5p", "m:west", "d:west:9m", "d:south:1s", "d:east:2m"]);
  });

  it("手順タブで並び替えた打牌の順序は、盤面編集を挟んでも保持される", () => {
    // ユーザーが東の2打目を南の前に並べ替えた状態（輪番なら east,south,east になる）。
    const base = syncSeatsFromTimeline(
      kifu({
        meta: { dealer: "east" },
        timeline: [disc("east", "1m"), disc("east", "3m"), disc("south", "2p")],
      }),
    );
    const out = reconcileTimeline(base);
    expect(discKinds(out)).toEqual(["east:1m", "east:3m", "south:2p"]);
  });
});

describe("callDiscard の再実行・staleな timeline", () => {
  const baseKifu = () =>
    kifu({
      meta: { dealer: "east" },
      seats: {
        east: { hand: [], melds: [], river: [river(1, "5p")] },
        south: {},
        west: {},
        north: {},
      },
    });

  it("既に鳴かれている捨て牌への再実行は置き換える（鳴き・切った牌を重複させない）", () => {
    const first = callDiscard(baseKifu(), "east", 0, {
      caller: "south",
      type: "pon",
      discardTile: "1m",
    });
    const second = callDiscard(first, "east", 0, {
      caller: "west",
      type: "pon",
      discardTile: "2m",
    });
    expect(second.seats.east.river[0]?.calledBy).toBe("west");
    expect(second.seats.south.melds).toHaveLength(0);
    expect(second.seats.south.river).toHaveLength(0); // 旧・切った牌は置き換えで消える
    expect(second.seats.west.melds[0]).toMatchObject({ type: "pon", from: "east" });
    expect(second.seats.west.river.map((d) => d.tile)).toEqual(["2m"]);
    expect(second.timeline).toHaveLength(3); // 打牌(東)→鳴き(西)→打牌(西)
  });

  it("timeline が古く（stale）目的の捨て牌が無い場合も、seats から再整合して鳴ける", () => {
    // timeline は 1m の1打のみだが、盤面では 5p が追加済み（過去データ等の不整合）。
    const k = KifuSchema.parse({
      ...kifu({
        meta: { dealer: "east" },
        seats: {
          east: { hand: [], melds: [], river: [river(1, "1m"), river(2, "5p")] },
          south: {},
          west: {},
          north: {},
        },
      }),
      timeline: [disc("east", "1m")],
    });
    const out = callDiscard(k, "east", 1, { caller: "south", type: "pon", discardTile: "9m" });
    expect(out.seats.east.river[1]).toMatchObject({ tile: "5p", calledBy: "south" });
    expect(out.seats.south.melds[0]).toMatchObject({ type: "pon", from: "east" });
    expect(out.seats.south.river.map((d) => d.tile)).toEqual(["9m"]);
  });

  it("discardCallOf は捨て牌に付いた鳴き（種別・鳴いた人・チーの並び）を返す", () => {
    expect(discardCallOf(baseKifu(), "east", 0)).toBeNull();
    const pon1 = callDiscard(baseKifu(), "east", 0, {
      caller: "south",
      type: "pon",
      discardTile: "1m",
    });
    expect(discardCallOf(pon1, "east", 0)).toMatchObject({ caller: "south", type: "pon" });
    const k7 = kifu({
      meta: { dealer: "east" },
      seats: {
        east: { hand: [], melds: [], river: [river(1, "7p")] },
        south: {},
        west: {},
        north: {},
      },
    });
    const chi1 = callDiscard(k7, "east", 0, {
      caller: "south",
      type: "chi",
      chiRun: ["7p", "8p", "9p"],
      discardTile: "1m",
    });
    expect(discardCallOf(chi1, "east", 0)).toMatchObject({
      caller: "south",
      type: "chi",
      chiRun: ["7p", "8p", "9p"],
    });
  });

  it("大明槓→嶺上ツモ→打牌の手順を表現できる（カン直後に同席の打牌行・ツモ牌も編集可）", () => {
    const out = callDiscard(baseKifu(), "east", 0, { caller: "west", type: "kan" });
    // 鳴き（大明槓）の直後に西の打牌行を足し、嶺上ツモ牌(draw)を付けられる。
    const withRinshan = KifuSchema.parse({
      ...out,
      timeline: [...out.timeline, { ...disc("west", "6s"), draw: "6s", tsumogiri: true }],
    });
    const synced = syncSeatsFromTimeline(withRinshan);
    expect(synced.seats.west.melds[0]?.type).toBe("kan_open");
    expect(synced.seats.west.river[0]).toMatchObject({ tile: "6s", tsumogiri: true });
    const last = synced.timeline[synced.timeline.length - 1];
    expect(last?.kind === "discard" && last.draw).toBe("6s");
  });
});

describe("手順の表示行（鳴き行に鳴いた人の打牌を併合する）", () => {
  const meldEv = (seat: string, from: string | null = "east") =>
    ({
      kind: "meld",
      seat,
      meld: {
        type: "pon" as const,
        tiles: [
          { tile: "5p", confidence: 1 },
          { tile: "5p", confidence: 1 },
          { tile: "5p", confidence: 1 },
        ],
        from,
      },
    }) as unknown as TimelineEvent;

  it("timelineRows: 鳴きの直後にある同席の打牌は同じ行に併合される", () => {
    const tl = [
      { ...disc("east", "5p"), calledBy: "west" as const },
      meldEv("west"),
      { ...disc("west", "9m") },
      disc("south", "1s"),
    ];
    const rows = timelineRows(tl);
    expect(rows.map((r) => [r.index, r.discardIndex])).toEqual([
      [0, null],
      [1, 2], // 鳴き行に西の打牌を併合
      [3, null],
    ]);
  });

  it("timelineRows: 直後の打牌が別席なら併合しない", () => {
    const tl = [meldEv("west"), disc("south", "1s")];
    expect(timelineRows(tl).map((r) => [r.index, r.discardIndex])).toEqual([
      [0, null],
      [1, null],
    ]);
  });

  it("setMeldDiscard: 併合対象があれば更新、無ければ直後に挿入する（嶺上ツモも設定可）", () => {
    // 併合対象なし → 挿入。
    const inserted = setMeldDiscard([meldEv("west")], 0, { tile: "9m" as never });
    expect(inserted).toHaveLength(2);
    expect(inserted[1]).toMatchObject({ kind: "discard", seat: "west", tile: "9m" });
    // 併合対象あり → 更新（draw=嶺上ツモ）。
    const updated = setMeldDiscard(inserted, 0, { draw: "6s" as never });
    expect(updated).toHaveLength(2);
    expect(updated[1]).toMatchObject({ kind: "discard", seat: "west", tile: "9m", draw: "6s" });
  });

  it("moveTimelineRow: 鳴き行は併合した打牌ごと動く", () => {
    const tl = [
      { ...disc("east", "5p"), calledBy: "west" as const },
      meldEv("west"),
      { ...disc("west", "9m") },
      disc("south", "1s"),
    ];
    const rows = timelineRows(tl);
    // 鳴き行（rows[1]）を末尾へ。
    const moved = moveTimelineRow(tl, rows, 1, 2);
    expect(
      moved.map((e) => (e.kind === "discard" ? `d:${e.seat}:${e.tile}` : `m:${e.seat}`)),
    ).toEqual(["d:east:5p", "d:south:1s", "m:west", "d:west:9m"]);
  });

  it("removeTimelineRow: 鳴き行は併合した打牌ごと消え、鳴き印も解除される", () => {
    const tl = [
      { ...disc("east", "5p"), calledBy: "west" as const },
      meldEv("west"),
      { ...disc("west", "9m") },
    ];
    const rows = timelineRows(tl);
    const removed = removeTimelineRow(tl, rows[1]!);
    expect(removed).toHaveLength(1);
    expect(removed[0]).toMatchObject({ kind: "discard", seat: "east", calledBy: null });
  });

  it("cycleEventSeat: 鳴き行の席替えは併合した打牌も一緒に動かす", () => {
    const tl = [
      { ...disc("east", "5p"), calledBy: "south" as const },
      meldEv("south"),
      { ...disc("south", "9m") },
    ];
    const next = cycleEventSeat(tl, 1); // 南→西
    expect(next[1]).toMatchObject({ kind: "meld", seat: "west" });
    expect(next[2]).toMatchObject({ kind: "discard", seat: "west", tile: "9m" });
    // 鳴き印も新しい鳴き主に付け替わる。
    expect(next[0]).toMatchObject({ kind: "discard", calledBy: "west" });
  });
});
