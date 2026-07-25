import { describe, expect, it } from "vitest";
import type { Tile } from "@rigel/schema";
import { compareTiles } from "./edit";
import { shanten } from "./shanten";
import { winningTiles } from "./tenpai";
import { bestDiscards, discardUkeires } from "./ukeire";
import {
  createQuizRng,
  generateChinitsuQuestion,
  generateEfficiencyQuestion,
  FREE_QUIZ_PER_DAY,
  QUIZ_EMPTY_HISTORY_MESSAGE,
  QUIZ_KIND_DESCRIPTIONS,
  QUIZ_KIND_LABELS,
  QUIZ_KIND_PROMPTS,
  QUIZ_LIMIT_MESSAGE,
  QUIZ_MAX_GENERATION_ATTEMPTS,
  QUIZ_SESSION_SECONDS,
} from "./quiz";

/** 理牌済み（compareTiles で非減少）か。 */
function isSorted(tiles: readonly Tile[]): boolean {
  return tiles.every((t, i) => i === 0 || compareTiles(tiles[i - 1]!, t) <= 0);
}

/** 同種の最大枚数（赤5は出題に含まれない前提なのでコード一致で数える）。 */
function maxDuplicates(tiles: readonly Tile[]): number {
  const c = new Map<Tile, number>();
  for (const t of tiles) c.set(t, (c.get(t) ?? 0) + 1);
  return Math.max(...c.values());
}

describe("createQuizRng（シード付き決定的乱数）", () => {
  it("同一シードから同一の乱数列を再現し、値は0以上1未満", () => {
    const a = createQuizRng(20260725);
    const b = createQuizRng(20260725);
    for (let i = 0; i < 100; i++) {
      const v = a();
      expect(v).toBe(b());
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it.each([
    [1, 2],
    [42, 43],
    [20260725, 7],
  ])("異なるシード %i と %i は異なる乱数列になる", (s1, s2) => {
    const a = createQuizRng(s1);
    const b = createQuizRng(s2);
    const seqA = Array.from({ length: 5 }, () => a());
    const seqB = Array.from({ length: 5 }, () => b());
    expect(seqA).not.toEqual(seqB);
  });
});

describe("出題の決定性（同一シード→同一問題列）", () => {
  it.each([
    { name: "清一色", gen: generateChinitsuQuestion },
    { name: "牌効率", gen: generateEfficiencyQuestion },
  ])("$name: 同一シードから同一の問題列が再現される", ({ gen }) => {
    const a = createQuizRng(123);
    const b = createQuizRng(123);
    const fromA = [gen(a), gen(a)];
    const fromB = [gen(b), gen(b)];
    expect(fromA).toEqual(fromB);
  });

  it.each([
    { name: "清一色", gen: generateChinitsuQuestion },
    { name: "牌効率", gen: generateEfficiencyQuestion },
  ])("$name: 異なるシードからは異なる問題になる（固定シード123/456で確認）", ({ gen }) => {
    const q1 = gen(createQuizRng(123));
    const q2 = gen(createQuizRng(456));
    expect(q1).not.toEqual(q2);
  });
});

describe("清一色問題の品質（シード20260725で20問）", () => {
  const rng = createQuizRng(20260725);
  const questions = Array.from({ length: 20 }, () => generateChinitsuQuestion(rng));

  it("全問が単色13枚・赤5なし・同種4枚以内・理牌済み", () => {
    const mismatches: string[] = [];
    for (const q of questions) {
      const hand = q.tiles.join("");
      if (q.kind !== "chinitsu") mismatches.push(`${hand}: kind=${q.kind}`);
      if (q.tiles.length !== 13) mismatches.push(`${hand}: ${q.tiles.length}枚`);
      const suits = new Set(q.tiles.map((t) => t[1]));
      if (suits.size !== 1 || q.tiles.some((t) => t[1] === "z")) {
        mismatches.push(`${hand}: 単色でない`);
      }
      if (q.tiles.some((t) => t[0] === "0")) mismatches.push(`${hand}: 赤5を含む`);
      if (maxDuplicates(q.tiles) > 4) mismatches.push(`${hand}: 同種5枚`);
      if (!isSorted(q.tiles)) mismatches.push(`${hand}: 理牌されていない`);
    }
    expect(mismatches).toEqual([]);
  });

  it("全問がテンパイ（shanten===0）で answer は winningTiles と一致し2種以上", () => {
    const mismatches: string[] = [];
    for (const q of questions) {
      const hand = q.tiles.join("");
      if (shanten(q.tiles) !== 0) mismatches.push(`${hand}: shanten=${shanten(q.tiles)}`);
      const waits = winningTiles(q.tiles);
      if (JSON.stringify(q.answer) !== JSON.stringify(waits)) {
        mismatches.push(`${hand}: answer=${q.answer.join(",")} waits=${waits.join(",")}`);
      }
      if (q.answer.length < 2) mismatches.push(`${hand}: 待ち${q.answer.length}種`);
    }
    expect(mismatches).toEqual([]);
  });

  it("出題スートが1色に固定されない（20問で2色以上）", () => {
    const suits = new Set(questions.map((q) => q.tiles[0]![1]));
    expect(suits.size).toBeGreaterThanOrEqual(2);
  });
});

describe("牌効率問題の品質（シード20260725で20問）", () => {
  const rng = createQuizRng(20260725);
  const questions = Array.from({ length: 20 }, () => generateEfficiencyQuestion(rng));

  it("全問が14枚・赤5なし・同種4枚以内・理牌済み", () => {
    const mismatches: string[] = [];
    for (const q of questions) {
      const hand = q.tiles.join("");
      if (q.kind !== "efficiency") mismatches.push(`${hand}: kind=${q.kind}`);
      if (q.tiles.length !== 14) mismatches.push(`${hand}: ${q.tiles.length}枚`);
      if (q.tiles.some((t) => t[0] === "0")) mismatches.push(`${hand}: 赤5を含む`);
      if (maxDuplicates(q.tiles) > 4) mismatches.push(`${hand}: 同種5枚`);
      if (!isSorted(q.tiles)) mismatches.push(`${hand}: 理牌されていない`);
    }
    expect(mismatches).toEqual([]);
  });

  it("全問の shanten が 1 か 2 で、出題の shanten フィールドと一致する", () => {
    const mismatches: string[] = [];
    for (const q of questions) {
      const hand = q.tiles.join("");
      const s = shanten(q.tiles);
      if (s !== 1 && s !== 2) mismatches.push(`${hand}: shanten=${s}`);
      if (q.shanten !== s) mismatches.push(`${hand}: フィールド=${q.shanten} 実際=${s}`);
    }
    expect(mismatches).toEqual([]);
  });

  it("answer は bestDiscards と一致し、「最小向聴を保つ打牌2種以上・answer はその全部ではない」", () => {
    const mismatches: string[] = [];
    for (const q of questions) {
      const hand = q.tiles.join("");
      if (JSON.stringify(q.answer) !== JSON.stringify(bestDiscards(q.tiles))) {
        mismatches.push(`${hand}: answer=${q.answer.join(",")}`);
      }
      const all = discardUkeires(q.tiles);
      const keep = all.filter((u) => u.shanten === all[0]!.shanten);
      if (keep.length < 2) mismatches.push(`${hand}: 最小向聴を保つ打牌が${keep.length}種`);
      if (q.answer.length >= keep.length) {
        mismatches.push(`${hand}: 全打牌が正解（差が付かない）`);
      }
    }
    expect(mismatches).toEqual([]);
  });
});

describe("特訓の共有定数・文言（web/mobile の画面と api のサーバ強制で共有）", () => {
  it("1回の挑戦は60秒・無料は1日3回", () => {
    expect(QUIZ_SESSION_SECONDS).toBe(60);
    expect(FREE_QUIZ_PER_DAY).toBe(3);
  });

  // 文言方針（[決定] 2026-07-25 オーナーレビュー）: 短く。機能名は「特訓」・1回のプレイは「挑戦」。
  // ルールの補足（完全一致/同率）は種目選択カードの説明に寄せ、出題指示文は最短にする。
  it.each([
    {
      kind: "chinitsu" as const,
      label: "清一色 多面待ち",
      desc: "単色13枚のテンパイから待ち牌を全部見抜く（完全一致で正解）。多面待ちを読む速さを鍛える。",
      prompt: "待ち牌を全部選ぶ",
    },
    {
      kind: "efficiency" as const,
      label: "牌効率（受け入れ最大）",
      desc: "14枚から受け入れが最大になる1枚を切る（同率はどれでも正解）。手広く構える感覚を鍛える。",
      prompt: "受け入れ最大の牌を切る",
    },
  ])(
    "$kind: ラベル「$label」・説明にルール補足を寄せ・出題指示文は最短「$prompt」",
    ({ kind, label, desc, prompt }) => {
      expect(QUIZ_KIND_LABELS[kind]).toBe(label);
      expect(QUIZ_KIND_DESCRIPTIONS[kind]).toBe(desc);
      expect(QUIZ_KIND_PROMPTS[kind]).toBe(prompt);
    },
  );

  it("上限メッセージは短く、無料枠（3回）と有料無制限だけを伝える", () => {
    expect(QUIZ_LIMIT_MESSAGE).toBe(
      "本日の無料枠（3回）を使い切りました。有料プランなら無制限です。",
    );
    expect(QUIZ_LIMIT_MESSAGE).toContain(`${FREE_QUIZ_PER_DAY}回`);
    expect(QUIZ_LIMIT_MESSAGE).toContain("無制限");
  });

  it("マイページ特訓タブの空状態文言は短い1文（web/mobile で共有）", () => {
    expect(QUIZ_EMPTY_HISTORY_MESSAGE).toBe("まだ特訓の記録がありません");
  });
});

describe("試行上限（品質フィルタを満たせない場合は Error）", () => {
  it("既定の試行上限は10000回", () => {
    expect(QUIZ_MAX_GENERATION_ATTEMPTS).toBe(10000);
  });

  it.each([
    // rng が常に同じ値(0.1) → 毎回同じ手 → 品質フィルタに落ち続けて上限到達（実測で確認済み）。
    { name: "清一色", run: () => generateChinitsuQuestion(() => 0.1, 30) },
    { name: "牌効率", run: () => generateEfficiencyQuestion(() => 0.1, 30) },
  ])("$name: フィルタを満たせない乱数では上限到達で Error を投げる", ({ run }) => {
    expect(run).toThrowError(/試行上限/);
  });
});
