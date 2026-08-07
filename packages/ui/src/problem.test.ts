import {
  KifuSchema,
  ProblemSchema,
  PROBLEM_SCHEMA_VERSION,
  type Kifu,
  type Problem,
  type Tile,
} from "@rigel/schema";
import { describe, expect, it } from "vitest";
import {
  actionLabel,
  addDraftMeld,
  answerNeedsTile,
  assembleProblem,
  draftToKifu,
  buildProblemAnswer,
  canSubmitProblemAnswer,
  chiRunLabel,
  choiceKeyLabel,
  kifuToProblemDraft,
  isFlatProblem,
  problemChiVariants,
  problemHandMax,
  problemRiverTiles,
  problemRoundLabel,
  problemToKifu,
  statsRatios,
  parseRiverEditTarget,
  problemHandTiles,
  removeDraftRiverTile,
  replaceDraftRiverTile,
  toggleDraftRiverTsumogiri,
  togglePickedTile,
  CALL_CHOICES,
  PROBLEM_FULL_HAND,
  PROBLEM_KIND_LABELS,
  PROBLEM_LIMIT,
  LIMIT_MESSAGES,
  type ProblemDraft,
} from "./index";

const HAND_13: Tile[] = [
  "9m",
  "1m",
  "5m",
  "2m",
  "3m",
  "4m",
  "6m",
  "7m",
  "8m",
  "1p",
  "2p",
  "3p",
  "4p",
];

function makeProblem(): Problem {
  return ProblemSchema.parse({
    schemaVersion: PROBLEM_SCHEMA_VERSION,
    kind: "call",
    pov: "south",
    targetSeat: "west",
    seats: {
      east: {},
      south: { hand: HAND_13.map((t) => ({ tile: t })) },
      west: { river: [{ order: 1, tile: "5p" }] },
      north: {},
    },
    meta: { dealer: "east", honba: 2, kyotaku: 1, junme: 6, dora: ["3z"] },
    rules: { kuitan: false },
  });
}

describe("kifuToProblemDraft（写真AI再現: AIドラフト→何切る編集ドラフト）", () => {
  /** AI解析結果の Kifu ドラフト（null 混在）を最小指定で組む。 */
  function aiKifu(over: Record<string, unknown> = {}): Kifu {
    return KifuSchema.parse({
      schemaVersion: "1.0.0",
      capturedAt: "2026-07-14T00:00:00.000Z",
      cameraBottomSeat: "east",
      seats: { east: {}, south: {}, west: {}, north: {} },
      ...over,
    });
  }

  it("手牌の null 牌（読めなかった牌）は落とし、確定牌だけを理牌して写す（推測しない）", () => {
    const k = aiKifu({
      seats: {
        east: {
          hand: [{ tile: "3p" }, { tile: null }, { tile: "1m" }],
        },
        south: {},
        west: {},
        north: {},
      },
      readingNotes: "グレアで1枚読めず",
    });
    const { draft, readingNotes } = kifuToProblemDraft(k, "east");
    expect(draft.kind).toBe("discard");
    expect(draft.pov).toBe("east");
    expect(draft.hand).toEqual(["1m", "3p"]); // null は持ち込まない・理牌
    expect(draft.drawn).toBeNull(); // 上限以下ならツモ欄は空のまま
    expect(readingNotes).toBe("グレアで1枚読めず 読めなかった牌を省きました（手牌1枚）。");
  });

  it("読めなかった牌を省いたときは readingNotes で知らせる（黙って捨てない）", () => {
    const k = aiKifu({
      seats: {
        east: {
          hand: [{ tile: "1m" }, { tile: null }], // 読めない手牌1枚 → 省く
          melds: [
            {
              type: "pon",
              tiles: [{ tile: "5z" }, { tile: null }, { tile: "5z" }], // null 入り副露 → 丸ごと省く
              from: null,
            },
          ],
        },
        south: { river: [{ order: 1, tile: null }] }, // 読めない河1枚 → 省く
        west: {},
        north: {},
      },
    });
    const { draft, readingNotes } = kifuToProblemDraft(k, "east");
    expect(draft.hand).toEqual(["1m"]);
    expect(draft.melds).toEqual([]);
    expect(readingNotes).toBe("読めなかった牌を省きました（手牌1枚・副露1組・河1枚）。");
  });

  it("上限を超えて読めた牌を省いたときは readingNotes で知らせる（黙って捨てない）", () => {
    const fifteen = Array.from({ length: 12 }, (_, i) => ({
      tile: `${(i % 9) + 1}m`,
    }));
    const k = aiKifu({
      seats: {
        east: {
          hand: fifteen, // 12枚読めた
          melds: [
            {
              type: "pon",
              tiles: [{ tile: "5z" }, { tile: "5z" }, { tile: "5z" }],
              from: null,
            },
          ],
        },
        south: {},
        west: {},
        north: {},
      },
    });
    // 上限 = 13 - 3×1副露 = 10枚 + ツモ1枚 → 12枚読みなら1枚が入り切らない。
    const { draft, readingNotes } = kifuToProblemDraft(k, "east");
    expect(draft.hand).toHaveLength(10);
    expect(draft.drawn).not.toBeNull();
    expect(readingNotes).toContain("1枚を省きました");
  });

  it("手牌が上限（副露3枚換算で13枚）を超えて読めたら、読み順の末尾をツモ欄に置く", () => {
    const fourteen: Tile[] = [
      "1m",
      "2m",
      "3m",
      "4m",
      "5m",
      "6m",
      "7m",
      "8m",
      "9m",
      "1p",
      "2p",
      "3p",
      "4p",
      "5p", // 読み順の末尾＝ツモ欄へ
    ];
    const k = aiKifu({
      seats: {
        east: { hand: fourteen.map((tile) => ({ tile })) },
        south: {},
        west: {},
        north: {},
      },
    });
    const { draft } = kifuToProblemDraft(k, "east");
    expect(draft.hand).toHaveLength(13);
    expect(draft.drawn).toBe("5p");
  });

  it("null を含む副露は丸ごと落とし（確定牌の世界）、残った副露で手牌上限を数える", () => {
    const k = aiKifu({
      seats: {
        east: {
          hand: Array.from({ length: 11 }, (_, i) => ({
            tile: `${(i % 9) + 1}m`,
          })),
          melds: [
            {
              type: "pon",
              tiles: [{ tile: "5z" }, { tile: "5z" }, { tile: "5z" }],
              from: null,
            },
            {
              type: "chi",
              tiles: [{ tile: "1s" }, { tile: null }, { tile: "3s" }],
              from: null,
            },
          ],
        },
        south: {},
        west: {},
        north: {},
      },
    });
    const { draft } = kifuToProblemDraft(k, "east");
    expect(draft.melds).toHaveLength(1); // null 入りのチーは落ちる
    // 上限 = 13 - 3×1副露 = 10枚 → 11枚目（読み順の末尾）はツモ欄へ。
    expect(draft.hand).toHaveLength(10);
    expect(draft.drawn).not.toBeNull();
  });

  it("4席の河（ツモ切り込み・null はスキップ）とドラ・巡目・本場/供託・親/場風・ルールを引き継ぐ", () => {
    const k = aiKifu({
      seats: {
        east: { hand: [{ tile: "1m" }] },
        south: {
          river: [
            { order: 1, tile: "9s", tsumogiri: true },
            { order: 2, tile: null },
          ],
        },
        west: {},
        north: {},
      },
      meta: { dealer: "south", roundWind: "east", honba: 2, kyotaku: 1, junme: 7, dora: ["3z"] },
      rules: { kuitan: false },
    });
    const { draft } = kifuToProblemDraft(k, "east");
    expect(draft.rivers.south).toEqual([{ tile: "9s", tsumogiri: true }]); // null はスキップ
    expect(draft.meta).toMatchObject({
      dealer: "south",
      roundWind: "east",
      honba: 2,
      kyotaku: 1,
      junme: 7,
      dora: ["3z"],
    });
    expect(draft.rules?.kuitan).toBe(false);
    expect(draft.targetSeat).not.toBe("east"); // 鳴き判断に切り替えても自席にならない既定
  });
});

describe("チーの構成（鳴き判断の回答）", () => {
  it("problemChiVariants は対象牌を含む順子のうち、残り2枚が手牌にある候補だけを返す", () => {
    // 手牌に 1p,2p,3p,4p・対象 5p → 345 のみ（456/567 は 6p,7p が無い）。
    expect(problemChiVariants(makeProblem())).toEqual([["3p", "4p", "5p"]]);
  });

  it("problemChiVariants は赤5の手牌も5として使える（候補の牌は手牌の実コードに合わせる）", () => {
    const p = ProblemSchema.parse({
      schemaVersion: PROBLEM_SCHEMA_VERSION,
      kind: "call",
      pov: "south",
      targetSeat: "west",
      seats: {
        east: {},
        south: {
          hand: ["1m", "2m", "3m", "4m", "5m", "6m", "7m", "8m", "9m", "1s", "2s", "0p", "4p"].map(
            (t) => ({ tile: t }),
          ),
        },
        west: { river: [{ order: 1, tile: "6p" }] },
        north: {},
      },
    });
    // 対象 6p: 456（手牌の 4p と赤5=0p）だけが成立。
    expect(problemChiVariants(p)).toEqual([["4p", "0p", "6p"]]);
  });

  it("chiRunLabel は「345筒」の形（赤5は5表記）", () => {
    expect(chiRunLabel(["3p", "4p", "5p"])).toBe("345筒");
    expect(chiRunLabel(["4p", "0p", "6p"])).toBe("456筒");
    expect(chiRunLabel(["5m", "6m", "7m"])).toBe("567萬");
  });

  it("buildProblemAnswer はチーの構成を回答に乗せる", () => {
    const a = buildProblemAnswer({
      kind: "call",
      tile: "1m",
      riichi: false,
      tsumogiri: false,
      call: "chi",
      chiTiles: ["3p", "4p", "5p"],
    });
    expect(a).toMatchObject({ type: "call", call: "chi", chiTiles: ["3p", "4p", "5p"] });
  });

  it("actionLabel / choiceKeyLabel は構成つきチーを「345筒でチーして…」と表す（旧キーは従来表記）", () => {
    expect(
      actionLabel({ type: "call", call: "chi", chiTiles: ["3p", "4p", "5p"], discard: "1m" }),
    ).toBe("345筒でチーして1萬切り");
    expect(choiceKeyLabel("call:chi:345p:1m")).toBe("345筒でチーして1萬切り");
    expect(choiceKeyLabel("call:chi:1m")).toBe("チーして1萬切り");
  });
});

describe("isFlatProblem（平面何切る＝場況なしの判定。[決定] 2026-08-08 フラット表示）", () => {
  /** 平面何切るの最小形（自席の手牌＋ツモのみ。他席・河は空）。 */
  function flatProblem(over: Record<string, unknown> = {}): Problem {
    return ProblemSchema.parse({
      schemaVersion: PROBLEM_SCHEMA_VERSION,
      kind: "discard",
      pov: "south",
      drawn: "5p",
      seats: {
        east: {},
        south: { hand: HAND_13.map((t) => ({ tile: t })) },
        west: {},
        north: {},
      },
      meta: { dealer: "east", junme: 6, dora: ["3z"] },
      ...over,
    });
  }

  it("自席の手牌（＋ツモ・ドラ）だけの問題は平面", () => {
    expect(isFlatProblem(flatProblem())).toBe(true);
  });

  it("自席に副露があっても平面（副露は手牌の一部として平面表示できる）", () => {
    const p = flatProblem({
      seats: {
        east: {},
        south: {
          hand: HAND_13.slice(0, 10).map((t) => ({ tile: t })),
          melds: [
            { type: "pon", tiles: [{ tile: "1z" }, { tile: "1z" }, { tile: "1z" }], from: "east" },
          ],
        },
        west: {},
        north: {},
      },
    });
    expect(isFlatProblem(p)).toBe(true);
  });

  it("自席の河に牌があれば平面ではない（巡目の場況がある＝卓で見せる）", () => {
    const p = flatProblem({
      seats: {
        east: {},
        south: {
          hand: HAND_13.map((t) => ({ tile: t })),
          river: [{ order: 1, tile: "9s" }],
        },
        west: {},
        north: {},
      },
    });
    expect(isFlatProblem(p)).toBe(false);
  });

  it("点数の記録があれば平面ではない（点数状況は卓のネームプレートでしか出せない）", () => {
    const p = flatProblem({ scores: { east: 25000, south: 25000, west: 25000, north: 25000 } });
    expect(isFlatProblem(p)).toBe(false);
  });

  it("他家に河・手牌・副露のどれかがあれば平面ではない（鳴き判断問題を含む）", () => {
    // makeProblem は西家の河に対象牌がある鳴き判断問題。
    expect(isFlatProblem(makeProblem())).toBe(false);
    const withOppHand = flatProblem({
      seats: {
        east: { hand: [{ tile: null }] }, // 伏せ牌1枚でも場況情報
        south: { hand: HAND_13.map((t) => ({ tile: t })) },
        west: {},
        north: {},
      },
    });
    expect(isFlatProblem(withOppHand)).toBe(false);
  });
});

describe("problemToKifu（盤面描画の再利用のための変換）", () => {
  it("KifuSchema を通る牌譜になり、pov が手前・手牌は理牌される", () => {
    const kifu = problemToKifu(makeProblem());
    expect(kifu.schemaVersion).toBe("1.0.0");
    expect(kifu.cameraBottomSeat).toBe("south");
    // 理牌（9m,1m,5m,… → 1m..9m,1p..4p）
    expect(kifu.seats.south.hand.map((t) => t.tile)).toEqual([
      "1m",
      "2m",
      "3m",
      "4m",
      "5m",
      "6m",
      "7m",
      "8m",
      "9m",
      "1p",
      "2p",
      "3p",
      "4p",
    ]);
    // 局情報・ルールが写る
    expect(kifu.meta.dealer).toBe("east");
    expect(kifu.meta.honba).toBe(2);
    expect(kifu.meta.kyotaku).toBe(1);
    expect(kifu.meta.dora).toEqual(["3z"]);
    expect(kifu.rules.kuitan).toBe(false);
    // 対象席の河も写る
    expect(kifu.seats.west.river.map((d) => d.tile)).toEqual(["5p"]);
  });
});

describe("actionLabel（回答の人間向けラベル）", () => {
  it("打牌・リーチ・鳴き・スルーを日本語にする", () => {
    expect(actionLabel({ type: "discard", tile: "5p", riichi: false, tsumogiri: false })).toBe(
      "5筒切り",
    );
    expect(actionLabel({ type: "discard", tile: "1z", riichi: true, tsumogiri: false })).toBe(
      "東切り・リーチ",
    );
    expect(actionLabel({ type: "call", call: "pon", chiTiles: null, discard: "2m" })).toBe(
      "ポンして2萬切り",
    );
    expect(actionLabel({ type: "call", call: "chi", chiTiles: null, discard: "0s" })).toBe(
      "チーして赤5索切り",
    );
    expect(actionLabel({ type: "call", call: "kan", chiTiles: null, discard: null })).toBe("カン");
    expect(actionLabel({ type: "pass" })).toBe("スルー");
  });

  it("ツモ切りは手出しと区別したラベルにする", () => {
    expect(actionLabel({ type: "discard", tile: "5p", riichi: false, tsumogiri: true })).toBe(
      "5筒ツモ切り",
    );
    expect(actionLabel({ type: "discard", tile: "5p", riichi: true, tsumogiri: true })).toBe(
      "5筒ツモ切り・リーチ",
    );
  });
});

describe("choiceKeyLabel（分布キー→日本語ラベル）", () => {
  it("choiceKey を actionLabel と同じ文言に戻す", () => {
    expect(choiceKeyLabel("discard:5p")).toBe("5筒切り");
    expect(choiceKeyLabel("discard:1z:riichi")).toBe("東切り・リーチ");
    expect(choiceKeyLabel("call:pon:2m")).toBe("ポンして2萬切り");
    expect(choiceKeyLabel("call:kan")).toBe("カン");
    expect(choiceKeyLabel("pass")).toBe("スルー");
  });
  it("ツモ切り・リーチ付きのキーも戻せる", () => {
    expect(choiceKeyLabel("discard:5p:tsumogiri")).toBe("5筒ツモ切り");
    expect(choiceKeyLabel("discard:5p:riichi:tsumogiri")).toBe("5筒ツモ切り・リーチ");
  });
  it("不明なキーはそのまま返す（表示を壊さない）", () => {
    expect(choiceKeyLabel("garbage:x")).toBe("garbage:x");
    expect(choiceKeyLabel("discard:5p:unknown")).toBe("discard:5p:unknown");
  });
});

describe("statsRatios（分布の割合計算）", () => {
  it("件数の多い順に並べ、割合(%)を付ける", () => {
    const rows = statsRatios({ "discard:5p": 3, pass: 1 });
    expect(rows).toEqual([
      { key: "discard:5p", count: 3, ratio: 75 },
      { key: "pass", count: 1, ratio: 25 },
    ]);
  });
  it("空なら空配列", () => {
    expect(statsRatios({})).toEqual([]);
  });
});

describe("buildProblemAnswer / answerNeedsTile（回答UIの選択状態→アクション）", () => {
  it("何切る: 牌が選ばれていればリーチ・ツモ切り込みで組み立てる（未選択は null）", () => {
    expect(
      buildProblemAnswer({
        kind: "discard",
        tile: "5p",
        riichi: true,
        tsumogiri: false,
        call: null,
      }),
    ).toEqual({ type: "discard", tile: "5p", riichi: true, tsumogiri: false });
    expect(
      buildProblemAnswer({
        kind: "discard",
        tile: "5p",
        riichi: false,
        tsumogiri: true,
        call: null,
      }),
    ).toEqual({ type: "discard", tile: "5p", riichi: false, tsumogiri: true });
    expect(
      buildProblemAnswer({
        kind: "discard",
        tile: null,
        riichi: false,
        tsumogiri: false,
        call: null,
      }),
    ).toBeNull();
  });

  it("鳴き判断: スルー/カンは牌不要、ポン/チーは切る牌が必要", () => {
    expect(
      buildProblemAnswer({
        kind: "call",
        tile: null,
        riichi: false,
        tsumogiri: false,
        call: "pass",
      }),
    ).toEqual({ type: "pass" });
    expect(
      buildProblemAnswer({
        kind: "call",
        tile: null,
        riichi: false,
        tsumogiri: false,
        call: "kan",
      }),
    ).toEqual({ type: "call", call: "kan", chiTiles: null, discard: null });
    expect(
      buildProblemAnswer({
        kind: "call",
        tile: "2m",
        riichi: false,
        tsumogiri: false,
        call: "pon",
      }),
    ).toEqual({ type: "call", call: "pon", chiTiles: null, discard: "2m" });
    expect(
      buildProblemAnswer({
        kind: "call",
        tile: null,
        riichi: false,
        tsumogiri: false,
        call: "pon",
      }),
    ).toBeNull();
    expect(
      buildProblemAnswer({ kind: "call", tile: null, riichi: false, tsumogiri: false, call: null }),
    ).toBeNull();
  });

  it("canSubmit は組み立て可能と同値、needsTile は何切るとポン/チーだけ true", () => {
    expect(
      canSubmitProblemAnswer({
        kind: "call",
        tile: null,
        riichi: false,
        tsumogiri: false,
        call: "pass",
      }),
    ).toBe(true);
    expect(
      canSubmitProblemAnswer({
        kind: "discard",
        tile: null,
        riichi: false,
        tsumogiri: false,
        call: null,
      }),
    ).toBe(false);
    expect(answerNeedsTile({ kind: "discard", call: null })).toBe(true);
    expect(answerNeedsTile({ kind: "call", call: "chi" })).toBe(true);
    expect(answerNeedsTile({ kind: "call", call: "kan" })).toBe(false);
    expect(answerNeedsTile({ kind: "call", call: "pass" })).toBe(false);
  });
});

describe("problemHandTiles（視点席の理牌済み手牌の牌コード。サムネ・OG画像で共用）", () => {
  it("視点席の手牌を理牌して牌コードの配列で返す", () => {
    const p = ProblemSchema.parse({
      schemaVersion: PROBLEM_SCHEMA_VERSION,
      kind: "call",
      pov: "south",
      targetSeat: "west",
      seats: {
        east: {},
        south: {
          // わざと理牌前の順で置く（カードでは理牌済みで出ることを確認する）。
          hand: ["9m", "1m", "5m", "2m", "3m", "4m", "6m", "7m", "8m", "1p", "2p", "3p", "1z"].map(
            (t) => ({ tile: t }),
          ),
        },
        west: { river: [{ order: 1, tile: "5p" }] },
        north: {},
      },
    });
    expect(problemHandTiles(p)).toEqual([
      "1m",
      "2m",
      "3m",
      "4m",
      "5m",
      "6m",
      "7m",
      "8m",
      "9m",
      "1p",
      "2p",
      "3p",
      "1z",
    ]);
  });
});

describe("河ドラフトの編集ヘルパ（web/mobile の何切る編集で共用）", () => {
  const rivers = () => ({
    east: [
      { tile: "1m" as Tile, tsumogiri: false },
      { tile: "2m" as Tile, tsumogiri: true },
    ],
    south: [],
    west: [],
    north: [],
  });

  it("parseRiverEditTarget: riveredit ターゲット文字列を席と index に分解する", () => {
    expect(parseRiverEditTarget("riveredit:east:1")).toEqual({ seat: "east", index: 1 });
    expect(parseRiverEditTarget("river:east")).toBeNull();
    expect(parseRiverEditTarget(null)).toBeNull();
  });

  it("replaceDraftRiverTile: 指定位置の牌だけ置き換え、ツモ切りフラグは保持する", () => {
    const next = replaceDraftRiverTile(rivers(), "east", 1, "9p");
    expect(next.east).toEqual([
      { tile: "1m", tsumogiri: false },
      { tile: "9p", tsumogiri: true },
    ]);
  });

  it("toggleDraftRiverTsumogiri: 指定位置のツモ切りだけ反転する", () => {
    const next = toggleDraftRiverTsumogiri(rivers(), "east", 0);
    expect(next.east.map((d) => d.tsumogiri)).toEqual([true, true]);
  });

  it("removeRiverTile: 指定位置の牌を外す（他席は不変）", () => {
    const next = removeDraftRiverTile(rivers(), "east", 0);
    expect(next.east).toEqual([{ tile: "2m", tsumogiri: true }]);
    expect(next.south).toEqual([]);
  });
});

describe("togglePickedTile（切る牌の選択トグル。位置で区別＝同じ牌2枚でも枠は1つ）", () => {
  it("未選択から選ぶと選択になり、同じ位置をもう一度で解除", () => {
    const p1 = togglePickedTile(null, "4m", false, 3);
    expect(p1).toEqual({ tile: "4m", drawn: false, index: 3 });
    expect(togglePickedTile(p1, "4m", false, 3)).toBeNull();
  });

  it("同じ牌コードでも位置が違えば選択が移る（解除にならない）", () => {
    const p1 = togglePickedTile(null, "4m", false, 3);
    expect(togglePickedTile(p1, "4m", false, 4)).toEqual({ tile: "4m", drawn: false, index: 4 });
  });

  it("手牌とツモ牌は drawn で区別する（同じ牌コードでも別扱い）", () => {
    const hand = togglePickedTile(null, "5p", false, 9);
    expect(togglePickedTile(hand, "5p", true, -1)).toEqual({ tile: "5p", drawn: true, index: -1 });
    const drawn = togglePickedTile(null, "5p", true, -1);
    expect(togglePickedTile(drawn, "5p", true, -1)).toBeNull(); // ツモ牌の再タップは解除
  });
});

describe("assembleProblem（編集状態→Problem の組み立て・検証。web/mobile 編集画面が共有）", () => {
  function draft(overrides: Partial<ProblemDraft> = {}): ProblemDraft {
    return {
      kind: "discard",
      pov: "east",
      hand: [...HAND_13],
      melds: [],
      drawn: "5p",
      targetSeat: "south",
      rivers: {
        east: [],
        south: [{ tile: "1z", tsumogiri: false }],
        west: [],
        north: [],
      },
      meta: { dealer: "east", roundWind: "east", honba: 1, kyotaku: 0, junme: 6, dora: ["3z"] },
      scores: { east: "25000", south: "24000", west: "26000", north: "25000" },
      // rules は省略＝既定（Mリーグ相当）に任せる
      explanation: "解説",
      ...overrides,
    };
  }

  it("正しい編集状態から検証済み Problem を組み立てる（河の order 連番・点数の数値化込み。正解は持たない）", () => {
    const { problem, error } = assembleProblem(draft());
    expect(error).toBeUndefined();
    expect(problem && "answer" in problem).toBe(false); // 正解は設けない
    expect(problem?.explanation).toBe("解説");
    expect(problem?.seats.south.river.map((d) => d.order)).toEqual([1]);
    expect(problem?.scores).toEqual({ east: 25000, south: 24000, west: 26000, north: 25000 });
    expect(problem?.meta.dora).toEqual(["3z"]);
  });

  it("枚数不足は日本語のエラーを返す", () => {
    expect(assembleProblem(draft({ hand: HAND_13.slice(0, 12) })).error).toContain("13枚");
  });

  it("鳴き判断はツモ牌を落とし対象席を立てる（kind に応じた整形）", () => {
    const { problem } = assembleProblem(draft({ kind: "call", targetSeat: "south" }));
    expect(problem?.drawn).toBeNull();
    expect(problem?.targetSeat).toBe("south");
  });

  it("scores が null なら点数状況なしで組み立てる", () => {
    expect(assembleProblem(draft({ scores: null })).problem?.scores).toBeNull();
  });

  it("河のツモ切り指定が Problem の river に写る", () => {
    const { problem } = assembleProblem(
      draft({
        rivers: {
          east: [],
          south: [
            { tile: "1z", tsumogiri: false },
            { tile: "5p", tsumogiri: true },
          ],
          west: [],
          north: [],
        },
      }),
    );
    expect(problem?.seats.south.river.map((d) => d.tsumogiri)).toEqual([false, true]);
  });
});

describe("draftToKifu（編集途中の盤面プレビュー変換）", () => {
  it("枚数不足でも検証なしで Kifu になり、pov が手前・手牌は理牌される", () => {
    const kifu = draftToKifu({
      pov: "south",
      hand: ["9m", "1m"], // 2枚しかない編集途中
      melds: [],
      rivers: { east: [], south: [], west: [{ tile: "5p", tsumogiri: true }], north: [] },
      meta: { dealer: "east", roundWind: "east", honba: 1, kyotaku: 0, junme: 3, dora: ["3z"] },
    });
    expect(kifu.cameraBottomSeat).toBe("south");
    expect(kifu.seats.south.hand.map((t) => t.tile)).toEqual(["1m", "9m"]); // 理牌
    expect(kifu.seats.west.river.map((d) => d.order)).toEqual([1]);
    // ツモ切り指定はプレビューにもそのまま写る（グレー表示になる）。
    expect(kifu.seats.west.river.map((d) => d.tsumogiri)).toEqual([true]);
    expect(kifu.meta.dora).toEqual(["3z"]);
  });
});

describe("problemRoundLabel（局ラベル。卓中央・mobile の roundLabel で共用）", () => {
  it("場風＋巡目（場風が無ければ巡目のみ）", () => {
    expect(problemRoundLabel({ roundWind: "east", junme: 6 })).toBe("東場 6巡目");
    expect(problemRoundLabel({ roundWind: null, junme: 3 })).toBe("3巡目");
  });
});

describe("problemHandMax / addDraftMeld / problemRiverTiles（編集画面の共有部品）", () => {
  it("手牌上限は副露3枚換算（13 - 3×副露数）", () => {
    expect(PROBLEM_FULL_HAND).toBe(13);
    expect(problemHandMax(0)).toBe(13);
    expect(problemHandMax(2)).toBe(7);
  });

  it("addDraftMeld は副露を1組足し、溢れる手牌を末尾から外す", () => {
    const { hand, melds } = addDraftMeld([...HAND_13], [], "pon", "9s");
    expect(melds).toHaveLength(1);
    expect(melds[0]?.type).toBe("pon");
    expect(melds[0]?.tiles.map((t) => t.tile)).toEqual(["9s", "9s", "9s"]);
    expect(hand).toHaveLength(10); // 13 → 3枚換算で10枚
    // カンは kan_open として保存する。
    expect(addDraftMeld([], [], "kan", "1z").melds[0]?.type).toBe("kan_open");
  });

  it("problemRiverTiles は各席の河をツモ切りフラグ付きで写す（未指定は空）", () => {
    expect(problemRiverTiles()).toEqual({ east: [], south: [], west: [], north: [] });
    expect(problemRiverTiles(makeProblem()).west).toEqual([{ tile: "5p", tsumogiri: false }]);
  });
});

describe("CALL_CHOICES / PROBLEM_KIND_LABELS（表示定数の共有）", () => {
  it("選択式の並びとラベル・出題形式名が固定されている", () => {
    expect(CALL_CHOICES.map((c) => c.key)).toEqual(["pass", "pon", "chi", "kan"]);
    expect(CALL_CHOICES[0]?.label).toBe("スルー");
    expect(PROBLEM_KIND_LABELS).toEqual({ discard: "何切る", call: "鳴き判断" });
  });
});

describe("PROBLEM_LIMIT（何切るの保存上限）", () => {
  it("free は 20 問・有料は無制限(null)", () => {
    expect(PROBLEM_LIMIT).toEqual({ free: 20, next: null, pro: null });
  });
  it("上限の共通文言がある", () => {
    expect(LIMIT_MESSAGES.problems).toContain("20問");
  });
});
