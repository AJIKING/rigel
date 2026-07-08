import { ProblemSchema, PROBLEM_SCHEMA_VERSION, type Problem, type Tile } from "@rigel/schema";
import { describe, expect, it } from "vitest";
import {
  actionLabel,
  addDraftMeld,
  answerNeedsTile,
  assembleProblem,
  draftToKifu,
  buildProblemAnswer,
  canSubmitProblemAnswer,
  choiceKeyLabel,
  problemHandMax,
  problemRiverTiles,
  problemRoundLabel,
  problemToKifu,
  statsRatios,
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
      south: { hand: HAND_13.map((t) => ({ tile: t, confidence: 1 })) },
      west: { river: [{ order: 1, tile: "5p", confidence: 1 }] },
      north: {},
    },
    meta: { dealer: "east", honba: 2, kyotaku: 1, junme: 6, dora: ["3z"] },
    rules: { kuitan: false },
  });
}

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
    expect(actionLabel({ type: "call", call: "pon", discard: "2m" })).toBe("ポンして2萬切り");
    expect(actionLabel({ type: "call", call: "chi", discard: "0s" })).toBe("チーして赤5索切り");
    expect(actionLabel({ type: "call", call: "kan", discard: null })).toBe("カン");
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
    ).toEqual({ type: "call", call: "kan", discard: null });
    expect(
      buildProblemAnswer({
        kind: "call",
        tile: "2m",
        riichi: false,
        tsumogiri: false,
        call: "pon",
      }),
    ).toEqual({ type: "call", call: "pon", discard: "2m" });
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
