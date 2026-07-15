import { KifuSchema, type Kifu } from "@rigel/schema";
import { describe, expect, it } from "vitest";
import { applyTileEdit, calledByLabel } from "./index";
import { deriveTimeline, syncSeatsFromTimeline } from "./timeline";
import {
  addHandTile,
  addMeld,
  addRiverTile,
  applyResultMode,
  compareTiles,
  deriveWinResult,
  meldTiles,
  mutateKifu,
  NUMS,
  removeDoraTile,
  removeHandTile,
  removeMeld,
  removeRiverTile,
  resultModeOf,
  callDiscard,
  setDoraTile,
  setDiscardCalledBy,
  setDiscardFlags,
  chiRunAt,
  chiVariants,
  cycleCalledBy,
  otherSeats,
  sortHandTiles,
  sortKifuHands,
  SUITS,
} from "./edit";

function kifu(seats: Record<string, unknown> = {}): Kifu {
  return KifuSchema.parse({
    schemaVersion: "1.0.0",
    capturedAt: "2026-07-04T00:00:00.000Z",
    cameraBottomSeat: "east",
    seats: { east: {}, south: {}, west: {}, north: {}, ...seats },
  });
}

describe("鳴かれた捨て牌（setDiscardCalledBy / cycleCalledBy）", () => {
  it("cycleCalledBy は なし→下家→対面→上家→なし を巡回する（自席は出ない）", () => {
    expect(cycleCalledBy(null, "east")).toBe("south");
    expect(cycleCalledBy("south", "east")).toBe("west");
    expect(cycleCalledBy("west", "east")).toBe("north");
    expect(cycleCalledBy("north", "east")).toBeNull();
    expect(cycleCalledBy(null, "north")).toBe("east");
  });

  it("otherSeats は自席以外の3席を下家順で返す（鳴き先の候補）", () => {
    expect(otherSeats("east")).toEqual(["south", "west", "north"]);
    expect(otherSeats("west")).toEqual(["north", "east", "south"]);
  });

  it("calledByLabel は「鳴きなし/鳴き→◯家」の共通表記（web/mobile の編集UIで共用）", () => {
    expect(calledByLabel(null)).toBe("鳴きなし");
    expect(calledByLabel("south")).toBe("鳴き→南家");
  });

  it("calledByLabel は選手名があれば名前を優先する（無名は◯家のまま）", () => {
    expect(calledByLabel("south", "太郎")).toBe("鳴き→太郎");
    expect(calledByLabel("south", "")).toBe("鳴き→南家");
    expect(calledByLabel(null, "太郎")).toBe("鳴きなし");
  });

  it("chiVariants は選んだ牌を含む順子の候補を返す（両端1-9内・赤5は位置に残す）", () => {
    expect(chiVariants("7p")).toEqual([
      ["5p", "6p", "7p"],
      ["6p", "7p", "8p"],
      ["7p", "8p", "9p"],
    ]);
    expect(chiVariants("1m")).toEqual([["1m", "2m", "3m"]]);
    expect(chiVariants("9s")).toEqual([["7s", "8s", "9s"]]);
    // 赤5は「5」として並べ、選んだ牌の位置にそのまま入る。
    expect(chiVariants("0p")).toEqual([
      ["3p", "4p", "0p"],
      ["4p", "0p", "6p"],
      ["0p", "6p", "7p"],
    ]);
    // 字牌は順子を作れない（呼び出し側は従来どおり同牌3枚へフォールバック）。
    expect(chiVariants("1z")).toEqual([]);
  });

  it("chiRunAt は選んだ牌を指定位置（0=左端/1=中央/2=右端）に置く並びを返す（範囲外は null）", () => {
    expect(chiRunAt("7p", 0)).toEqual(["7p", "8p", "9p"]);
    expect(chiRunAt("7p", 1)).toEqual(["6p", "7p", "8p"]);
    expect(chiRunAt("7p", 2)).toEqual(["5p", "6p", "7p"]);
    expect(chiRunAt("9p", 0)).toBeNull(); // 9,10,11 は作れない
    expect(chiRunAt("1z", 1)).toBeNull(); // 字牌は順子を作れない
  });

  it("addMeld はチーの並び位置（chiIndex）を指定できる（mobile の並びチップ用）", () => {
    const next = addMeld(kifu(), "east", "chi", "7p", 0);
    expect(next.seats.east.melds[0]?.tiles.map((t) => t.tile)).toEqual(["7p", "8p", "9p"]);
  });

  it("removeMeld は鳴きを消すとき、鳴き元の捨て牌の鳴き印（calledBy）も解除する", () => {
    const k = KifuSchema.parse({
      ...kifu({
        east: { river: [{ order: 1, tile: "5p", calledBy: "south" }] },
        south: {
          melds: [
            {
              type: "pon",
              tiles: [{ tile: "5p" }, { tile: "5p" }, { tile: "5p" }],
              from: "east",
            },
          ],
        },
      }),
    });
    const next = removeMeld(k, "south", 0);
    expect(next.seats.south.melds).toHaveLength(0);
    expect(next.seats.east.river[0]?.calledBy).toBeNull();
  });

  it("setDiscardCalledBy は指定の捨て牌に印を付け、timeline 非空なら手順にも同期する", () => {
    const base = KifuSchema.parse({
      ...kifu({ east: { river: [{ order: 1, tile: "5p" }] } }),
      timeline: [{ kind: "discard", seat: "east", tile: "5p" }],
    });
    const marked = setDiscardCalledBy(base, "east", 0, "south");
    expect(marked.seats.east.river[0]?.calledBy).toBe("south");
    const first = marked.timeline[0];
    if (first?.kind !== "discard") throw new Error("discard expected");
    expect(first.calledBy).toBe("south");
    // null で解除できる。
    expect(setDiscardCalledBy(marked, "east", 0, null).seats.east.river[0]?.calledBy).toBeNull();
  });
});

describe("mutateKifu（複製→変更→Zod再検証の共通ヘルパ）", () => {
  it("変更した新しい Kifu を返し、元は不変", () => {
    const k = kifu();
    const next = mutateKifu(k, (d) => {
      d.meta.honba = 3;
    });
    expect(next.meta.honba).toBe(3);
    expect(k.meta.honba).toBe(0);
  });
  it("スキーマ違反になる変更は例外（検証を通らない牌譜を返さない）", () => {
    expect(() =>
      mutateKifu(kifu(), (d) => {
        d.meta.honba = -1;
      }),
    ).toThrow();
  });
});

describe("結果モード（resultModeOf / deriveWinResult / applyResultMode）", () => {
  it("resultModeOf: draw 優先、和了があれば win、無ければ none", () => {
    expect(resultModeOf(kifu())).toBe("none");
    expect(resultModeOf(mutateKifu(kifu(), (d) => void (d.result = "draw")))).toBe("draw");
    const win = applyResultMode(kifu(), "win", "east");
    expect(resultModeOf(win)).toBe("win");
  });

  it("deriveWinResult: 放銃者ありが1件でもあればロン、無ければツモ", () => {
    expect(deriveWinResult([])).toBeNull();
    const tsumo = { winner: "east", from: null } as never;
    const ron = { winner: "south", from: "west" } as never;
    expect(deriveWinResult([tsumo])).toBe("tsumo");
    expect(deriveWinResult([ron, tsumo])).toBe("ron");
  });

  it("applyResultMode(win): 和了が無ければ親のツモ和了1件を作り result を導出", () => {
    const next = applyResultMode(kifu(), "win", "south");
    expect(next.agari).toHaveLength(1);
    expect(next.agari[0]).toMatchObject({ winner: "south", from: null });
    expect(next.result).toBe("tsumo");
    expect(next.tenpai).toEqual([]);
  });

  it("applyResultMode(draw): 和了を消して draw にする（聴牌入力は保持）", () => {
    const win = applyResultMode(kifu(), "win", "east");
    const next = applyResultMode(
      mutateKifu(win, (d) => void (d.tenpai = ["east"])),
      "draw",
      "east",
    );
    expect(next.result).toBe("draw");
    expect(next.agari).toEqual([]);
    expect(next.tenpai).toEqual(["east"]);
  });

  it("applyResultMode(none): 結果・和了・聴牌をすべて消す", () => {
    const draw = applyResultMode(kifu(), "draw", "east");
    const next = applyResultMode(
      mutateKifu(draw, (d) => void (d.tenpai = ["east"])),
      "none",
      "east",
    );
    expect(next.result).toBeNull();
    expect(next.agari).toEqual([]);
    expect(next.tenpai).toEqual([]);
  });
});

describe("setDoraTile / removeDoraTile（ドラは複数枚・最大5）", () => {
  it("index 省略で追加、指定で差し替え、remove で1枚だけ取り除く", () => {
    let k = setDoraTile(kifu(), "dora", "3p");
    k = setDoraTile(k, "dora", "7s");
    expect(k.meta.dora).toEqual(["3p", "7s"]);
    k = setDoraTile(k, "dora", "1m", 0); // 1枚目を差し替え
    expect(k.meta.dora).toEqual(["1m", "7s"]);
    k = removeDoraTile(k, "dora", 0);
    expect(k.meta.dora).toEqual(["7s"]);
  });
  it("裏ドラも同じ操作（uraDora キー）", () => {
    const k = setDoraTile(kifu(), "uraDora", "5z");
    expect(k.meta.uraDora).toEqual(["5z"]);
    expect(k.meta.dora).toEqual([]); // 表は不変
  });
  it("6枚目の追加はスキーマ検証で例外（最大5）", () => {
    let k = kifu();
    for (const t of ["1m", "2m", "3m", "4m", "5m"] as const) k = setDoraTile(k, "dora", t);
    expect(() => setDoraTile(k, "dora", "6m")).toThrow();
  });
});

describe("addHandTile / removeHandTile", () => {
  it("手牌に確定(confidence=1)で追加し、元は不変", () => {
    const k = kifu();
    const next = addHandTile(k, "east", "1m");
    expect(next.seats.east.hand).toEqual([{ tile: "1m", confidence: 1 }]);
    expect(k.seats.east.hand).toHaveLength(0);
  });
  it("追加のたびに理牌される（選んだ順ではなく牌種順に並ぶ）", () => {
    let k = kifu();
    for (const t of ["7z", "1p", "9m", "1z", "3s"] as const) k = addHandTile(k, "east", t);
    expect(k.seats.east.hand.map((t) => t.tile)).toEqual(["9m", "1p", "3s", "1z", "7z"]);
  });
  it("指定位置の手牌を取り除く", () => {
    const k = addHandTile(addHandTile(kifu(), "east", "1m"), "east", "2m");
    const next = removeHandTile(k, "east", 0);
    expect(next.seats.east.hand.map((t) => t.tile)).toEqual(["2m"]);
  });
});

describe("理牌（compareTiles / sortHandTiles / sortKifuHands）", () => {
  it("compareTiles: 萬1-9 → 筒1-9 → 索1-9 → 東南西北白發中 の順", () => {
    const sorted = (["1z", "9s", "1p", "7z", "9m", "1m", "5z"] as const).slice().sort(compareTiles);
    expect(sorted).toEqual(["1m", "9m", "1p", "9s", "1z", "5z", "7z"]);
  });
  it("compareTiles: 赤5(0x)は同スートの5の直後、null は末尾", () => {
    expect(compareTiles("5m", "0m")).toBeLessThan(0);
    expect(compareTiles("0m", "6m")).toBeLessThan(0);
    expect(compareTiles(null, "9s")).toBeGreaterThan(0);
    expect(compareTiles("7z", null)).toBeLessThan(0);
    expect(compareTiles(null, null)).toBe(0);
  });
  it("sortHandTiles: confidence を牌ごと保ったまま並べ替えた新しい配列を返す（元は不変）", () => {
    const hand = [
      { tile: "1z" as const, confidence: 0.4 },
      { tile: null, confidence: 0 },
      { tile: "3m" as const, confidence: 1 },
    ];
    const sorted = sortHandTiles(hand);
    expect(sorted.map((t) => t.tile)).toEqual(["3m", "1z", null]);
    expect(sorted.map((t) => t.confidence)).toEqual([1, 0.4, 0]);
    expect(hand.map((t) => t.tile)).toEqual(["1z", null, "3m"]); // 元は不変
  });
  it("sortKifuHands: 全席の手牌を理牌し、河（order 時系列）と鳴きは変えない", () => {
    const k = kifu({
      east: {
        hand: [
          { tile: "1z", confidence: 1 },
          { tile: "1m", confidence: 1 },
        ],
        river: [
          { order: 1, tile: "9s", confidence: 1 },
          { order: 2, tile: "1s", confidence: 1 },
        ],
      },
      south: {
        hand: [
          { tile: "0p", confidence: 1 },
          { tile: "5p", confidence: 1 },
        ],
      },
    });
    const next = sortKifuHands(k);
    expect(next.seats.east.hand.map((t) => t.tile)).toEqual(["1m", "1z"]);
    expect(next.seats.south.hand.map((t) => t.tile)).toEqual(["5p", "0p"]);
    expect(next.seats.east.river.map((d) => d.tile)).toEqual(["9s", "1s"]); // 河はそのまま
    expect(k.seats.east.hand.map((t) => t.tile)).toEqual(["1z", "1m"]); // 元は不変
  });
});

describe("addRiverTile / removeRiverTile", () => {
  it("河に order 連番で追加する", () => {
    const k = addRiverTile(addRiverTile(kifu(), "east", "1z"), "east", "2z");
    expect(k.seats.east.river.map((d) => d.order)).toEqual([1, 2]);
    expect(k.seats.east.river[1]).toMatchObject({
      tile: "2z",
      riichi: false,
      tsumogiri: false,
      confidence: 1,
    });
  });
  it("取り除いたら order を 1..n に振り直す（連番を壊さない）", () => {
    let k = kifu();
    for (const t of ["1z", "2z", "3z"] as const) k = addRiverTile(k, "east", t);
    const next = removeRiverTile(k, "east", 1); // 2z を削除
    expect(next.seats.east.river.map((d) => d.tile)).toEqual(["1z", "3z"]);
    expect(next.seats.east.river.map((d) => d.order)).toEqual([1, 2]);
  });
});

describe("setDiscardFlags", () => {
  it("リーチ/ツモ切りを指定した項目だけ切り替える", () => {
    const k = addRiverTile(kifu(), "east", "5p");
    const withRiichi = setDiscardFlags(k, "east", 0, { riichi: true });
    expect(withRiichi.seats.east.river[0]).toMatchObject({ riichi: true, tsumogiri: false });
    const withTsumogiri = setDiscardFlags(withRiichi, "east", 0, { tsumogiri: true });
    expect(withTsumogiri.seats.east.river[0]).toMatchObject({ riichi: true, tsumogiri: true });
  });
});

describe("addMeld / removeMeld", () => {
  it("ポンは同牌3枚・カンは同牌4枚（kan は kan_open）", () => {
    const pon = addMeld(kifu(), "south", "pon", "5p");
    expect(pon.seats.south.melds[0]?.type).toBe("pon");
    expect(pon.seats.south.melds[0]?.tiles.map((t) => t.tile)).toEqual(["5p", "5p", "5p"]);
    const kan = addMeld(kifu(), "south", "kan", "1z");
    expect(kan.seats.south.melds[0]?.type).toBe("kan_open");
    expect(kan.seats.south.melds[0]?.tiles).toHaveLength(4);
  });
  it("カンは種別（大明槓/暗槓/加槓）を指定できる。すべて4枚", () => {
    for (const type of ["kan_open", "kan_closed", "kan_added"] as const) {
      const kan = addMeld(kifu(), "south", type, "3m");
      expect(kan.seats.south.melds[0]?.type).toBe(type);
      expect(kan.seats.south.melds[0]?.tiles.map((t) => t.tile)).toEqual(["3m", "3m", "3m", "3m"]);
    }
  });
  it("チーは選択牌を含む3連続（字牌は同牌3枚にフォールバック）", () => {
    const chi = addMeld(kifu(), "south", "chi", "3m");
    expect(chi.seats.south.melds[0]?.tiles.map((t) => t.tile)).toEqual(["2m", "3m", "4m"]);
    const zi = addMeld(kifu(), "south", "chi", "7z");
    expect(zi.seats.south.melds[0]?.tiles.map((t) => t.tile)).toEqual(["7z", "7z", "7z"]);
  });
  it("鳴くと手牌を末尾から減らす（ポン/チー=2・大明槓=3・暗槓=4・加槓=1）", () => {
    const hand = ["1m", "2m", "3m", "4m", "5m"];
    const withHand = () => kifu({ south: { hand: hand.map((t) => ({ tile: t, confidence: 1 })) } });
    expect(addMeld(withHand(), "south", "pon", "9p").seats.south.hand.map((t) => t.tile)).toEqual([
      "1m",
      "2m",
      "3m",
    ]); // 5 - 2
    expect(addMeld(withHand(), "south", "chi", "9p").seats.south.hand).toHaveLength(3); // -2
    expect(addMeld(withHand(), "south", "kan_open", "9p").seats.south.hand).toHaveLength(2); // -3
    expect(addMeld(withHand(), "south", "kan_closed", "9p").seats.south.hand).toHaveLength(1); // -4
    expect(addMeld(withHand(), "south", "kan_added", "9p").seats.south.hand).toHaveLength(4); // -1
  });
  it("手牌が足りなくても0未満にはしない", () => {
    const one = kifu({ south: { hand: [{ tile: "1m", confidence: 1 }] } });
    expect(addMeld(one, "south", "pon", "9p").seats.south.hand).toHaveLength(0);
  });
  it("鳴きを丸ごと取り除く", () => {
    const k = addMeld(addMeld(kifu(), "south", "pon", "5p"), "south", "pon", "6p");
    const next = removeMeld(k, "south", 0);
    expect(next.seats.south.melds.map((m) => m.tiles[0]?.tile)).toEqual(["6p"]);
  });
});

describe("timeline 非空のとき、盤面の河/鳴き編集が手順(timeline)へ同期される", () => {
  // east:1m だけを committed した牌譜（timeline 正典・非空）。
  const committed = (): Kifu =>
    KifuSchema.parse({
      schemaVersion: "1.0.0",
      capturedAt: "2026-07-04T00:00:00.000Z",
      cameraBottomSeat: "east",
      meta: { dealer: "east" },
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
      timeline: [
        {
          kind: "discard",
          seat: "east",
          draw: null,
          tile: "1m",
          tsumogiri: false,
          riichi: false,
          confidence: 1,
        },
      ],
    });
  const discShown = (k: Kifu) =>
    deriveTimeline(k)
      .filter((e) => e.kind === "discard")
      .map((e) => (e.kind === "discard" ? `${e.seat}:${e.tile}` : ""));

  it("addRiverTile: 足した打牌が手順に巡目位置で現れる（末尾集中しない）＝バグ修正", () => {
    const k = addRiverTile(committed(), "south", "2p");
    expect(discShown(k)).toEqual(["east:1m", "south:2p"]); // 1巡目 east→south
  });

  it("addRiverTile: リーチ/ツモ切りフラグも手順の打牌に載る", () => {
    const k = addRiverTile(committed(), "east", "9m", { riichi: true, tsumogiri: true });
    const ev = deriveTimeline(k).find((e) => e.kind === "discard" && e.tile === "9m");
    expect(ev?.kind === "discard" && ev.riichi).toBe(true);
    expect(ev?.kind === "discard" && ev.tsumogiri).toBe(true);
  });

  it("removeRiverTile: 消した打牌は手順からも消える", () => {
    const k = addRiverTile(committed(), "south", "2p");
    const removed = removeRiverTile(k, "south", 0);
    expect(discShown(removed)).toEqual(["east:1m"]);
  });

  it("applyTileEdit(river): 牌の変更が手順にも反映される", () => {
    const edited = applyTileEdit(committed(), { seat: "east", area: "river", index: 0 }, "9p");
    expect(discShown(edited)).toEqual(["east:9p"]);
  });

  it("setDiscardFlags: リーチ切替が手順にも反映される", () => {
    const k = setDiscardFlags(committed(), "east", 0, { riichi: true });
    const ev = deriveTimeline(k).find((e) => e.kind === "discard");
    expect(ev?.kind === "discard" && ev.riichi).toBe(true);
  });

  it("addMeld: 鳴きが手順に現れる", () => {
    const k = addMeld(committed(), "south", "pon", "5p");
    expect(deriveTimeline(k).some((e) => e.kind === "meld" && e.seat === "south")).toBe(true);
  });

  it("removeMeld: 鳴きが手順からも消え、残りの打牌順は保たれる", () => {
    const withMeld = addMeld(addRiverTile(committed(), "south", "2p"), "south", "pon", "5p");
    const removed = removeMeld(withMeld, "south", 0);
    expect(removed.timeline.some((e) => e.kind === "meld")).toBe(false);
    expect(discShown(removed)).toEqual(["east:1m", "south:2p"]);
  });

  it("データロス回帰: 盤面 add → 手順 commit 相当(syncSeats)しても打牌が残る", () => {
    const k = addRiverTile(committed(), "south", "2p");
    // 手順タブでの commit は syncSeatsFromTimeline(timeline)。add 分が消えないこと。
    const committedAgain = syncSeatsFromTimeline(k);
    expect(discShown(committedAgain)).toContain("south:2p");
  });

  it("timeline 空（新規牌譜）は空のまま＝挙動不変", () => {
    const fresh = kifu();
    const k = addRiverTile(fresh, "east", "1m");
    expect(k.timeline).toEqual([]); // materialize しない
    expect(discShown(k)).toEqual(["east:1m"]); // deriveTimeline は seats から導出
  });
});

describe("meldTiles / SUITS / NUMS（ピッカー素材）", () => {
  it("meldTiles: チーは 1-9 に収める（端は寄せる）", () => {
    expect(meldTiles("chi", "1m")).toEqual(["1m", "2m", "3m"]);
    expect(meldTiles("chi", "9s")).toEqual(["7s", "8s", "9s"]);
    expect(meldTiles("chi", "0p")).toEqual(["4p", "5p", "6p"]); // 赤5は5扱い
  });
  it("SUITS は 萬筒索字、NUMS は数牌に赤ドラを含み字牌は7種", () => {
    expect(SUITS.map((s) => s.suit)).toEqual(["m", "p", "s", "z"]);
    expect(NUMS.m).toContain("0m");
    expect(NUMS.z).toHaveLength(7);
  });
});

describe("callDiscard（捨て牌から鳴く: 鳴き作成＋結線＋鳴いた人の打牌）", () => {
  const base = () => kifu({ east: { river: [{ order: 1, tile: "5p" }] } });

  it("ポン: 鳴き（from=捨て主）と鳴き印が付き、鳴いた人の切った牌が手順の直後に入る", () => {
    const res = callDiscard(base(), "east", 0, {
      caller: "south",
      type: "pon",
      discardTile: "1m",
    });
    expect(res.seats.south.melds[0]).toMatchObject({ type: "pon", from: "east" });
    expect(res.seats.south.melds[0]!.tiles.map((t) => t.tile)).toEqual(["5p", "5p", "5p"]);
    expect(res.seats.east.river[0]).toMatchObject({ tile: "5p", calledBy: "south" });
    // 鳴いた人の打牌は手出し扱いで河に入る。
    expect(res.seats.south.river[0]).toMatchObject({ tile: "1m", tsumogiri: false });
    // 手順は 打牌(東5p)→鳴き(南)→打牌(南1m) の順に確定する。
    expect(res.timeline.map((e) => e.kind)).toEqual(["discard", "meld", "discard"]);
    expect(res.timeline[1]).toMatchObject({ kind: "meld", seat: "south" });
    expect(res.timeline[2]).toMatchObject({ kind: "discard", seat: "south", tile: "1m" });
  });

  it("チー: 選んだ並び（chiRun）を鳴き牌に使う", () => {
    const k = kifu({ east: { river: [{ order: 1, tile: "7p" }] } });
    const res = callDiscard(k, "east", 0, {
      caller: "south",
      type: "chi",
      chiRun: ["7p", "8p", "9p"],
      discardTile: "1m",
    });
    expect(res.seats.south.melds[0]!.tiles.map((t) => t.tile)).toEqual(["7p", "8p", "9p"]);
    expect(res.seats.south.melds[0]!.from).toBe("east");
  });

  it("カンは大明槓（kan_open・同牌4枚）として作る", () => {
    const res = callDiscard(base(), "east", 0, { caller: "west", type: "kan" });
    expect(res.seats.west.melds[0]).toMatchObject({ type: "kan_open", from: "east" });
    expect(res.seats.west.melds[0]!.tiles.map((t) => t.tile)).toEqual(["5p", "5p", "5p", "5p"]);
  });

  it("切った牌を選ばなければ鳴きだけ作る（打牌は挿入しない）", () => {
    const res = callDiscard(base(), "east", 0, { caller: "south", type: "pon" });
    expect(res.seats.south.river).toHaveLength(0);
    expect(res.timeline.map((e) => e.kind)).toEqual(["discard", "meld"]);
  });

  it("自分の捨て牌は鳴けない（そのまま返す）", () => {
    const res = callDiscard(base(), "east", 0, { caller: "east", type: "pon" });
    expect(res).toEqual(base());
  });

  it("鳴きと切った牌は、鳴かれた打牌の直後（後続の打牌より前）に入る", () => {
    const k = kifu({
      east: { river: [{ order: 1, tile: "5p" }] },
      south: { river: [{ order: 1, tile: "1s" }] },
    });
    const res = callDiscard(k, "east", 0, { caller: "west", type: "pon", discardTile: "9m" });
    expect(
      res.timeline.map((e) => (e.kind === "discard" ? `${e.seat}:${e.tile}` : `meld:${e.seat}`)),
    ).toEqual(["east:5p", "meld:west", "west:9m", "south:1s"]);
  });
});
