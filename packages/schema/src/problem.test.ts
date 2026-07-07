import { describe, expect, it } from "vitest";
import {
  choiceKey,
  isValidAnswer,
  ProblemActionSchema,
  ProblemSchema,
  problemTargetTile,
  PROBLEM_SCHEMA_VERSION,
  type Tile,
} from "./index";

// ------------------------------------------------------------
// ProblemSchema 用のフィクスチャ
// ------------------------------------------------------------

const HAND_13: Tile[] = [
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
];

const EMPTY_SEATS = { east: {}, south: {}, west: {}, north: {} };

function seatsWithHand(hand: Tile[], extra: Record<string, unknown> = {}) {
  return {
    ...EMPTY_SEATS,
    east: { hand: hand.map((t) => ({ tile: t, confidence: 1 })) },
    ...extra,
  };
}

/** 何切る問題（discard）の最小の正しい入力。 */
function discardProblem(overrides: Record<string, unknown> = {}) {
  return {
    schemaVersion: PROBLEM_SCHEMA_VERSION,
    kind: "discard",
    pov: "east",
    drawn: "5p",
    seats: seatsWithHand(HAND_13),
    ...overrides,
  };
}

/** 鳴き判断問題（call）の最小の正しい入力（南家が 5p を切った直後）。 */
function callProblem(overrides: Record<string, unknown> = {}) {
  return {
    schemaVersion: PROBLEM_SCHEMA_VERSION,
    kind: "call",
    pov: "east",
    targetSeat: "south",
    seats: seatsWithHand(HAND_13, {
      south: { river: [{ order: 1, tile: "5p", confidence: 1 }] },
    }),
    ...overrides,
  };
}

describe("ProblemActionSchema（回答アクション）", () => {
  it("打牌アクションを受け付ける（リーチ既定 false）", () => {
    const a = ProblemActionSchema.parse({ type: "discard", tile: "5p" });
    expect(a).toEqual({ type: "discard", tile: "5p", riichi: false });
  });

  it("リーチ付き打牌を受け付ける", () => {
    const a = ProblemActionSchema.parse({ type: "discard", tile: "0m", riichi: true });
    expect(a).toEqual({ type: "discard", tile: "0m", riichi: true });
  });

  it("不正な牌コードを弾く", () => {
    expect(() => ProblemActionSchema.parse({ type: "discard", tile: "9x" })).toThrow();
  });

  it("鳴きアクション: ポン/チーは切る牌が必須", () => {
    const pon = ProblemActionSchema.parse({ type: "call", call: "pon", discard: "2m" });
    expect(pon).toEqual({ type: "call", call: "pon", discard: "2m" });
    expect(() => ProblemActionSchema.parse({ type: "call", call: "pon" })).toThrow();
    expect(() => ProblemActionSchema.parse({ type: "call", call: "chi", discard: null })).toThrow();
  });

  it("カンは切る牌を持たない（嶺上ツモ後の打牌は問わない）", () => {
    const kan = ProblemActionSchema.parse({ type: "call", call: "kan" });
    expect(kan).toEqual({ type: "call", call: "kan", discard: null });
    expect(() => ProblemActionSchema.parse({ type: "call", call: "kan", discard: "2m" })).toThrow();
  });

  it("スルー（鳴かない）を受け付ける", () => {
    expect(ProblemActionSchema.parse({ type: "pass" })).toEqual({ type: "pass" });
  });
});

describe("choiceKey（回答の直列化＝分布集計のキー）", () => {
  it("同じ手は同じキー・異なる手は異なるキーになる", () => {
    expect(choiceKey({ type: "discard", tile: "5p", riichi: false })).toBe("discard:5p");
    expect(choiceKey({ type: "discard", tile: "5p", riichi: true })).toBe("discard:5p:riichi");
    expect(choiceKey({ type: "call", call: "pon", discard: "2m" })).toBe("call:pon:2m");
    expect(choiceKey({ type: "call", call: "kan", discard: null })).toBe("call:kan");
    expect(choiceKey({ type: "pass" })).toBe("pass");
  });
});

describe("ProblemSchema: 何切る（discard）", () => {
  it("手牌13枚+ツモで正しく parse され、既定値が埋まる", () => {
    const p = ProblemSchema.parse(discardProblem());
    expect(p.kind).toBe("discard");
    expect(p.drawn).toBe("5p");
    expect(p.targetSeat).toBeNull();
    expect(p.explanation).toBe("");
    expect(p.scores).toBeNull();
    expect(p.rules.kuitan).toBe(true); // RulesSchema の既定
    expect(p.meta.junme).toBe(1);
  });

  it("手牌が13枚でないと拒否する（12枚）", () => {
    expect(() =>
      ProblemSchema.parse(discardProblem({ seats: seatsWithHand(HAND_13.slice(0, 12)) })),
    ).toThrow();
  });

  it("副露は3枚換算で数える（副露1組なら手牌10枚で通る）", () => {
    const seats = {
      ...EMPTY_SEATS,
      east: {
        hand: HAND_13.slice(0, 10).map((t) => ({ tile: t, confidence: 1 })),
        melds: [
          {
            type: "pon",
            tiles: [
              { tile: "9s", confidence: 1 },
              { tile: "9s", confidence: 1 },
              { tile: "9s", confidence: 1 },
            ],
            from: null,
          },
        ],
      },
    };
    expect(() => ProblemSchema.parse(discardProblem({ seats }))).not.toThrow();
  });

  it("ツモ牌が無い・対象席がある discard は拒否する", () => {
    expect(() => ProblemSchema.parse(discardProblem({ drawn: null }))).toThrow();
    expect(() => ProblemSchema.parse(discardProblem({ targetSeat: "south" }))).toThrow();
  });

  it("視点の手牌に読めない牌(null)は入れられない", () => {
    const seats = seatsWithHand(HAND_13.slice(0, 12));
    (seats.east.hand as { tile: unknown }[]).push({ tile: null });
    expect(() => ProblemSchema.parse(discardProblem({ seats }))).toThrow();
  });

  it("正解（answer）というフィールドは持たない（多様な正解を前提に分布を見る）", () => {
    const p = ProblemSchema.parse(discardProblem());
    expect("answer" in p).toBe(false);
  });
});

describe("ProblemSchema: 鳴き判断（call）", () => {
  it("対象席の河の末尾の1枚を対象として parse できる", () => {
    const p = ProblemSchema.parse(callProblem());
    expect(p.targetSeat).toBe("south");
    expect(problemTargetTile(p)).toBe("5p");
    expect(p.drawn).toBeNull();
  });

  it("対象席が無い・ツモ牌がある call は拒否する", () => {
    expect(() => ProblemSchema.parse(callProblem({ targetSeat: null }))).toThrow();
    expect(() => ProblemSchema.parse(callProblem({ drawn: "5p" }))).toThrow();
  });

  it("対象席が自分（pov）だと拒否する", () => {
    expect(() => ProblemSchema.parse(callProblem({ targetSeat: "east" }))).toThrow();
  });

  it("対象席の河が空・末尾が読めない牌だと拒否する", () => {
    expect(() => ProblemSchema.parse(callProblem({ seats: seatsWithHand(HAND_13) }))).toThrow();
    expect(() =>
      ProblemSchema.parse(
        callProblem({
          seats: seatsWithHand(HAND_13, {
            south: { river: [{ order: 1, tile: null, confidence: 0 }] },
          }),
        }),
      ),
    ).toThrow();
  });
});

describe("isValidAnswer（回答者のアクション検証。API が分布に入れる前に使う）", () => {
  it("何切る: 手牌かツモ牌の打牌だけが有効", () => {
    const p = ProblemSchema.parse(discardProblem());
    expect(isValidAnswer(p, { type: "discard", tile: "1m", riichi: false })).toBe(true);
    expect(isValidAnswer(p, { type: "discard", tile: "5p", riichi: true })).toBe(true); // ツモ切り
    expect(isValidAnswer(p, { type: "discard", tile: "9s", riichi: false })).toBe(false); // 手牌に無い
    expect(isValidAnswer(p, { type: "pass" })).toBe(false); // kind 不一致
  });

  it("鳴き判断: call か pass だけが有効。鳴いた後に切る牌は手牌から", () => {
    const p = ProblemSchema.parse(callProblem());
    expect(isValidAnswer(p, { type: "pass" })).toBe(true);
    expect(isValidAnswer(p, { type: "call", call: "chi", discard: "2m" })).toBe(true);
    expect(isValidAnswer(p, { type: "call", call: "kan", discard: null })).toBe(true);
    expect(isValidAnswer(p, { type: "call", call: "pon", discard: "9s" })).toBe(false); // 手牌に無い
    expect(isValidAnswer(p, { type: "discard", tile: "1m", riichi: false })).toBe(false); // kind 不一致
  });
});
