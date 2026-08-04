// 特訓クイズ（60秒セッション）の結果スキーマ。
// クライアント採点の結果をサーバに記録する際の入口ゲート（量の上限つき）。
// 2026-08-04 追加: 出題スナップショット（QuizQuestionSchema）・回答レコード
// （QuizAnswerRecordSchema）・完了ペイロード（QuizFinishSchema=結果+全回答+エンジン版数）。
// サーバのシードリプレイ再採点と有料フル保存の背骨（Plan: docs/plans/quiz-open-and-ranking.md）。

import { describe, expect, it } from "vitest";
import {
  QuizAnswerRecordSchema,
  QuizFinishSchema,
  QuizKindSchema,
  QuizQuestionSchema,
  QuizResultSchema,
} from "./index";

describe("QuizKindSchema（クイズ種別）", () => {
  // score = 点数計算クイズ（[決定] 2026-07-26 追加）。
  // chinitsuUkeire = 清一色 牌効率（単色14枚から一番広くなる1枚を切る。[決定] 2026-07-26 追加。
  //   Plan: docs/plans/quiz-chinitsu-ukeire.md）。
  it.each([["chinitsu"], ["efficiency"], ["score"], ["chinitsuUkeire"]])(
    "%s を受理する",
    (kind) => {
      expect(QuizKindSchema.parse(kind)).toBe(kind);
    },
  );

  it.each([["speed"], [""], [null], [123]])("%o は拒否する", (kind) => {
    expect(QuizKindSchema.safeParse(kind).success).toBe(false);
  });
});

describe("QuizResultSchema（60秒セッション1回の結果）", () => {
  const valid = { kind: "chinitsu", total: 10, correct: 7, durationMs: 61_000 };

  it("正常な結果を受理する", () => {
    expect(QuizResultSchema.parse(valid)).toEqual(valid);
  });

  it.each([
    { name: "total=0・correct=0（1問も答えず終了）", over: { total: 0, correct: 0 } },
    { name: "correct=total（全問正解）", over: { total: 5, correct: 5 } },
    { name: "durationMs=0", over: { durationMs: 0 } },
    { name: "durationMs=120000（上限ちょうど）", over: { durationMs: 120_000 } },
    { name: "total=100（上限ちょうど）", over: { total: 100, correct: 0 } },
  ])("境界値: $name を受理する", ({ over }) => {
    expect(QuizResultSchema.safeParse({ ...valid, ...over }).success).toBe(true);
  });

  it.each([
    { name: "correct > total（採点の矛盾）", over: { total: 3, correct: 4 } },
    { name: "total が上限 100 超え", over: { total: 101 } },
    { name: "durationMs が上限 120000 超え", over: { durationMs: 120_001 } },
    { name: "total が負", over: { total: -1 } },
    { name: "correct が負", over: { correct: -1 } },
    { name: "durationMs が負", over: { durationMs: -1 } },
    { name: "total が小数", over: { total: 1.5 } },
    { name: "kind が不正", over: { kind: "unknown" } },
  ])("不正: $name を拒否する", ({ over }) => {
    expect(QuizResultSchema.safeParse({ ...valid, ...over }).success).toBe(false);
  });
});

// prettier-ignore
const CHINITSU_Q = {
  kind: "chinitsu",
  tiles: ["1p", "2p", "3p", "4p", "4p", "5p", "5p", "5p", "6p", "6p", "7p", "8p", "9p"],
  answer: ["4p", "5p", "6p"],
};
// prettier-ignore
const EFFICIENCY_Q = {
  kind: "efficiency",
  tiles: ["3m", "3m", "5m", "7m", "3p", "5p", "6p", "7p", "8p", "6s", "7s", "9s", "4z", "7z"],
  shanten: 2,
  answer: ["9s", "4z", "7z"],
};
// prettier-ignore
const CHINITSU_UKEIRE_Q = {
  kind: "chinitsuUkeire",
  tiles: ["1m", "1m", "1m", "2m", "2m", "4m", "4m", "5m", "5m", "7m", "7m", "7m", "8m", "9m"],
  suit: "m",
  shanten: 1,
  answer: ["7m"],
};
// prettier-ignore
const SCORE_Q = {
  kind: "score",
  closedTiles: ["4m", "5m", "6m", "1p", "1p", "1p", "5p", "5p", "1s", "1s", "2s", "2s", "3s", "3s"],
  melds: [{ type: "pon", tiles: ["7z", "7z", "7z"], from: "south" }],
  winTile: "3s",
  tsumo: false,
  riichi: true,
  seatWind: "east",
  roundWind: "east",
  doraIndicators: ["5z"],
  yaku: [{ name: "立直", han: 1 }],
  han: 2,
  fu: 40,
  label: "東1局 東家 リーチ ロン",
  choices: ["7700点", "3900点", "4800点", "2600点"],
  answer: "3900点",
};

describe("QuizQuestionSchema（出題スナップショット。サーバ再生成の保存とフル保存の背骨）", () => {
  it.each([
    { name: "清一色 何待ち", q: CHINITSU_Q },
    { name: "牌効率", q: EFFICIENCY_Q },
    { name: "清一色 牌効率", q: CHINITSU_UKEIRE_Q },
    { name: "点数計算（副露・リーチ入り）", q: SCORE_Q },
  ])("$name を受理する", ({ q }) => {
    expect(QuizQuestionSchema.safeParse(q).success).toBe(true);
  });

  it.each([
    { name: "清一色の手牌が13枚でない", q: { ...CHINITSU_Q, tiles: CHINITSU_Q.tiles.slice(1) } },
    {
      name: "牌効率の手牌が14枚でない",
      q: { ...EFFICIENCY_Q, tiles: EFFICIENCY_Q.tiles.slice(1) },
    },
    { name: "不正な牌", q: { ...CHINITSU_Q, tiles: [...CHINITSU_Q.tiles.slice(1), "9x"] } },
    { name: "点数計算の選択肢が4つでない", q: { ...SCORE_Q, choices: ["7700点"] } },
    { name: "未知の kind", q: { ...CHINITSU_Q, kind: "speed" } },
  ])("不正: $name を拒否する", ({ q }) => {
    expect(QuizQuestionSchema.safeParse(q).success).toBe(false);
  });
});

describe("QuizAnswerRecordSchema（見直しレコード=出題+回答+正誤。有料フル保存の1件）", () => {
  it("清一色レコード（picked=選んだ待ち牌）を受理する", () => {
    const r = { question: CHINITSU_Q, picked: ["4p", "5p", "6p"], ok: true };
    expect(QuizAnswerRecordSchema.safeParse(r).success).toBe(true);
  });

  it("点数計算レコード（picked=空・pickedChoice=選択肢）を受理する", () => {
    const r = { question: SCORE_Q, picked: [], pickedChoice: "7700点", ok: false };
    expect(QuizAnswerRecordSchema.safeParse(r).success).toBe(true);
  });

  it("picked が15枚以上は拒否する（回答は最大14枚）", () => {
    const r = { question: CHINITSU_Q, picked: Array(15).fill("1p"), ok: true };
    expect(QuizAnswerRecordSchema.safeParse(r).success).toBe(false);
  });
});

describe("QuizFinishSchema（完了ペイロード=結果+全回答+エンジン版数）", () => {
  const result = { kind: "efficiency", total: 2, correct: 1, durationMs: 61_000 };

  it("結果のみ（旧クライアント互換。answers 無し）を受理する", () => {
    expect(QuizFinishSchema.safeParse(result).success).toBe(true);
  });

  it("全回答つき（answers.length === total・engineVersion）を受理する", () => {
    const finish = {
      ...result,
      engineVersion: 1,
      answers: [{ picked: ["9s"] }, { picked: ["3m"] }],
    };
    expect(QuizFinishSchema.safeParse(finish).success).toBe(true);
  });

  it("点数計算の回答は choice で送る（picked は空）", () => {
    const finish = {
      kind: "score",
      total: 1,
      correct: 1,
      durationMs: 61_000,
      engineVersion: 1,
      answers: [{ picked: [], choice: "3900点" }],
    };
    expect(QuizFinishSchema.safeParse(finish).success).toBe(true);
  });

  it.each([
    {
      name: "answers.length !== total（採点対象が食い違う）",
      over: { answers: [{ picked: ["9s"] }] },
    },
    { name: "correct > total", over: { total: 1, correct: 2 } },
    {
      name: "answers が 100 件超え",
      over: {
        total: 100,
        correct: 0,
        answers: Array.from({ length: 101 }, () => ({ picked: [] })),
      },
    },
  ])("不正: $name を拒否する", ({ over }) => {
    expect(QuizFinishSchema.safeParse({ ...result, engineVersion: 1, ...over }).success).toBe(
      false,
    );
  });
});
