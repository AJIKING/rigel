// ============================================================
// QUIZ_ENGINE_VERSION のゴールデンテスト（2026-08-04 設計レビューで追加）
// ------------------------------------------------------------
// 「生成器の出力が同一シードで変わる変更をしたら版数を +1」という規則は、破ると
// **旧クライアントの回答を別の問題に対して再採点した結果が verified としてランキングに
// 載る**（unverified 側に倒れない）ため、コメント任せにせずテストで強制する。
// 固定シードの出題列ダイジェストを現行版数のキーで焼き付け、生成器（quiz.ts /
// quiz-score-question.ts / quiz-random.ts / shanten / ukeire / score-engine）の出力が
// 変わると必ず Red になる。**このテストが落ちたら**: 出力の変更が意図どおりか確認 →
// QUIZ_ENGINE_VERSION を +1 → 新版数のダイジェストを GOLDEN に「追記」する（旧行は
// 履歴として残す。書き換えたくなったら版数を上げ忘れているサイン）。
// ============================================================

import { QuizKindSchema } from "@rigel/schema";
import { describe, expect, it } from "vitest";
import { createQuizRng, defaultQuizQuestion, QUIZ_ENGINE_VERSION } from "./quiz";

/** FNV-1a 32bit（依存なしの安定ハッシュ。暗号強度は不要＝回帰検知が目的）。 */
function digest(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, "0");
}

/** 版数 → 固定シード出題列のダイジェスト（追記のみ。上の手順コメント参照）。 */
const GOLDEN: Record<number, string> = {
  1: "7639d970",
  // v2: 点数計算の条件ラベルを対局表記「東◯局 ◯家 ツモ」へ変更（2026-08-04 オーナー指示）。
  2: "62f402a9",
};

describe("QUIZ_ENGINE_VERSION と生成器出力の対応（ゴールデン）", () => {
  it("現行版数のダイジェストが焼き付けと一致する（生成器を変えたら版数+1が強制される）", () => {
    const questions = QuizKindSchema.options.map((kind) => {
      // 種目ごとに独立した固定シード（1本の rng を跨がせると種目追加で全種目が変わる）。
      const rng = createQuizRng(20260804);
      return Array.from({ length: 3 }, () => defaultQuizQuestion(kind, rng));
    });
    expect(digest(JSON.stringify(questions))).toBe(GOLDEN[QUIZ_ENGINE_VERSION]);
  });
});
