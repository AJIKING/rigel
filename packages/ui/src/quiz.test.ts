import { describe, expect, it } from "vitest";
import {
  FREE_QUIZ_PER_DAY,
  normalizeRed,
  QuizKindSchema,
  RulesSchema,
  type Tile,
} from "@rigel/schema";
import { compareTiles } from "./edit";
import { handScore, payText } from "./score";
import { scoreAgariHand } from "./score-engine";
import { shanten } from "./shanten";
import { winningTiles } from "./tenpai";
import { bestDiscards, discardUkeires } from "./ukeire";
import {
  createQuizRng,
  generateChinitsuQuestion,
  generateEfficiencyQuestion,
  QUIZ_MAX_GENERATION_ATTEMPTS,
} from "./quiz";
import {
  QUIZ_CARD_MOTIF,
  QUIZ_EMPTY_HISTORY_MESSAGE,
  QUIZ_FEEDBACK_MS,
  QUIZ_KIND_DESCRIPTIONS,
  QUIZ_KIND_LABELS,
  QUIZ_KIND_PROMPTS,
  QUIZ_KINDS,
  QUIZ_LIMIT_MESSAGE,
  QUIZ_RULE_NOTE,
  QUIZ_SEND_ERROR_MESSAGE,
  QUIZ_SESSION_SECONDS,
  QUIZ_START_ERROR_MESSAGE,
} from "./quiz-copy";
import {
  generateScoreQuestion,
  scoreDisplayTiles,
  scoreYakuLine,
  QUIZ_SCORE_RULES,
  type ScoreQuestion,
} from "./quiz-score-question";

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
    { name: "点数計算", gen: generateScoreQuestion },
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
    { name: "点数計算", gen: generateScoreQuestion },
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
    {
      kind: "score" as const,
      label: "点数計算",
      desc: "牌姿から点数を即答する（鳴き・ドラあり）。点数計算を体で覚える。",
      prompt: "点数を選ぶ",
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

  // ルール一文（[決定] 2026-07-26 オーナー指示）: 開始ダイアログの種目名/説明の近くに出す。
  // 簡潔に1文・冗長にしない。
  it("ルール一文は「60秒でできるだけ多くの問題に答える」（開始ダイアログで共有）", () => {
    expect(QUIZ_RULE_NOTE).toBe("60秒でできるだけ多くの問題に答える");
  });

  // 2026-07-26 セッション状態機械の抽出に伴い、web/mobile が重複定義していた定数を
  // quiz-copy.ts に一元化した（表記ゆれ・値ズレの防止）。
  it("QUIZ_KINDS は背骨（QuizKindSchema.options）から導出され、ラベル等の全 Record と鍵が一致する", () => {
    expect(QUIZ_KINDS).toEqual(QuizKindSchema.options);
    for (const kind of QUIZ_KINDS) {
      expect(QUIZ_KIND_LABELS[kind]).toBeTruthy();
      expect(QUIZ_KIND_DESCRIPTIONS[kind]).toBeTruthy();
      expect(QUIZ_KIND_PROMPTS[kind]).toBeTruthy();
      expect(QUIZ_CARD_MOTIF[kind]).toHaveLength(3);
    }
  });

  it("○×フィードバックは0.5秒（web/mobile 共通の QUIZ_FEEDBACK_MS）", () => {
    expect(QUIZ_FEEDBACK_MS).toBe(500);
  });

  it("開始失敗・結果送信失敗の文言は web/mobile で共有する（表記ゆれ防止）", () => {
    expect(QUIZ_START_ERROR_MESSAGE).toBe("開始できませんでした。少し待って再度お試しください。");
    expect(QUIZ_SEND_ERROR_MESSAGE).toBe("結果の送信に失敗しました。この挑戦は記録に残りません。");
  });

  // 点数計算クイズのルール（[決定] 2026-07-26 オーナー指示）: 切り上げ満貫なし。
  // 7700（子4翻30符ロン）・11600（親4翻30符ロン）の古典的な点数を出題するため、
  // Mリーグ既定（kiriage:true）は使わない。他の項目は既定どおり。
  it("点数計算クイズのルールは切り上げ満貫なし（他は既定どおり）", () => {
    expect(QUIZ_SCORE_RULES).toEqual(RulesSchema.parse({ kiriage: false }));
    expect(QUIZ_SCORE_RULES.kiriage).toBe(false);
  });
});

/** 生成器の出力（v2）をそのまま採点エンジンの入力に変換する（機械検証用）。 */
function engineInput(q: ScoreQuestion) {
  return {
    closedTiles: q.closedTiles,
    melds: q.melds.map((m) => ({ type: m.type, tiles: m.tiles })),
    winTile: q.winTile,
    tsumo: q.tsumo,
    seatWind: q.seatWind,
    roundWind: q.roundWind,
    doraIndicators: q.doraIndicators,
    riichi: q.riichi,
  };
}

describe("点数計算問題の品質 v2（シード20260726で20問・採点はエンジンへ全委譲）", () => {
  const rng = createQuizRng(20260726);
  const questions = Array.from({ length: 20 }, () => generateScoreQuestion(rng));
  const SEAT_JA = { east: "東", south: "南", west: "西", north: "北" } as const;

  it("全問が和了形（エンジン非null）で、answer・han/fu・役内訳がエンジン出力と一致する", () => {
    const mismatches: string[] = [];
    for (const q of questions) {
      const hand = q.closedTiles.join("");
      const r = scoreAgariHand(engineInput(q), QUIZ_SCORE_RULES);
      if (r === null) {
        mismatches.push(`${hand}: エンジンが採点不能（null）`);
        continue;
      }
      if (q.answer !== payText(r.score)) {
        mismatches.push(`${hand}: answer=${q.answer} エンジン=${payText(r.score)}`);
      }
      if (q.han !== r.han || q.fu !== r.fu) {
        mismatches.push(`${hand}: ${q.han}翻${q.fu}符 エンジン=${r.han}翻${r.fu}符`);
      }
      if (q.han < 1) mismatches.push(`${hand}: 無役`);
      if (JSON.stringify(q.yaku) !== JSON.stringify(r.yaku)) {
        mismatches.push(`${hand}: yaku=${JSON.stringify(q.yaku)}`);
      }
    }
    expect(mismatches).toEqual([]);
  });

  it("closedTiles は理牌済みで winTile を含み、枚数は 14-3×副露（表示列は winTile を1枚除く）", () => {
    const mismatches: string[] = [];
    for (const q of questions) {
      const hand = q.closedTiles.join("");
      if (q.kind !== "score") mismatches.push(`${hand}: kind=${q.kind}`);
      if (q.closedTiles.length !== 14 - 3 * q.melds.length) {
        mismatches.push(`${hand}: ${q.closedTiles.length}枚（副露${q.melds.length}組）`);
      }
      if (!isSorted(q.closedTiles)) mismatches.push(`${hand}: 理牌されていない`);
      if (!q.closedTiles.includes(q.winTile)) mismatches.push(`${hand}: winTile 不在`);
      if (scoreDisplayTiles(q).length !== q.closedTiles.length - 1) {
        mismatches.push(`${hand}: 表示列の枚数`);
      }
    }
    expect(mismatches).toEqual([]);
  });

  it("choices はユニーク4件で answer を含む", () => {
    const mismatches: string[] = [];
    for (const q of questions) {
      const hand = q.closedTiles.join("");
      if (q.choices.length !== 4) mismatches.push(`${hand}: 選択肢${q.choices.length}件`);
      if (new Set(q.choices).size !== 4) mismatches.push(`${hand}: 選択肢が重複`);
      if (!q.choices.includes(q.answer)) mismatches.push(`${hand}: 正解が選択肢に無い`);
    }
    expect(mismatches).toEqual([]);
  });

  it("赤5は各色1枚以下・同種は（副露・ドラ表示牌込みで）4枚以内", () => {
    const mismatches: string[] = [];
    for (const q of questions) {
      const hand = q.closedTiles.join("");
      const all = [...q.closedTiles, ...q.melds.flatMap((m) => m.tiles)];
      for (const suit of ["m", "p", "s"] as const) {
        if (all.filter((t) => t === `0${suit}`).length > 1) {
          mismatches.push(`${hand}: 赤5${suit}が2枚`);
        }
      }
      const c = new Map<string, number>();
      for (const t of [...all, ...q.doraIndicators]) {
        const k = normalizeRed(t);
        c.set(k, (c.get(k) ?? 0) + 1);
      }
      if (Math.max(...c.values()) > 4) mismatches.push(`${hand}: 同種5枚`);
    }
    expect(mismatches).toEqual([]);
  });

  it("副露は0〜3組（ポン/チーは2組・カンは3組まで）で、構成・from が正しい", () => {
    const mismatches: string[] = [];
    for (const q of questions) {
      const hand = q.closedTiles.join("");
      const kans = q.melds.filter((m) => m.type === "kan_open" || m.type === "kan_closed");
      if (q.melds.length > 3) mismatches.push(`${hand}: 副露${q.melds.length}組`);
      if (q.melds.length - kans.length > 2) mismatches.push(`${hand}: ポン/チー3組以上`);
      if (kans.length > 3) mismatches.push(`${hand}: カン4組`);
      for (const m of q.melds) {
        const norm = m.tiles.map(normalizeRed);
        if (m.type === "kan_open" || m.type === "kan_closed") {
          if (norm.length !== 4 || new Set(norm).size !== 1) {
            mismatches.push(`${hand}: カン構成 ${m.tiles.join("")}`);
          }
        } else if (m.type === "pon") {
          if (norm.length !== 3 || new Set(norm).size !== 1) {
            mismatches.push(`${hand}: ポン構成 ${m.tiles.join("")}`);
          }
        } else if (m.type === "chi") {
          const nums = norm.map((t) => Number(t[0])).sort((a, b) => a - b);
          const suits = new Set(norm.map((t) => t[1]));
          if (
            norm.length !== 3 ||
            suits.size !== 1 ||
            norm[0]![1] === "z" ||
            nums[1] !== nums[0]! + 1 ||
            nums[2] !== nums[0]! + 2
          ) {
            mismatches.push(`${hand}: チー構成 ${m.tiles.join("")}`);
          }
        } else {
          mismatches.push(`${hand}: type=${m.type}`);
        }
        if (m.type === "kan_closed") {
          if (m.from !== null) mismatches.push(`${hand}: 暗槓に from`);
        } else if (m.from === null || m.from === q.seatWind) {
          mismatches.push(`${hand}: from=${m.from}（晒しは自分以外の席）`);
        }
      }
    }
    expect(mismatches).toEqual([]);
  });

  it("条件が整合する（ラベルは「親（東家）/子（◯家）・ツモ/ロン・場風 ◯」・場風は東/南・ドラ表示は1〜2枚）", () => {
    const mismatches: string[] = [];
    for (const q of questions) {
      const hand = q.closedTiles.join("");
      if (q.roundWind !== "east" && q.roundWind !== "south") {
        mismatches.push(`${hand}: 場風=${q.roundWind}`);
      }
      // 親子は点数計算の本質なのでラベルに明示する（[決定] 2026-07-26 オーナー指示）。
      // リーチはツモ/ロンの前に置く（例「親（東家）・リーチ・ツモ・場風 東」）。
      const role = q.seatWind === "east" ? "親" : "子";
      const label = `${role}（${SEAT_JA[q.seatWind]}家）・${q.riichi ? "リーチ・" : ""}${q.tsumo ? "ツモ" : "ロン"}・場風 ${SEAT_JA[q.roundWind]}`;
      if (q.label !== label) mismatches.push(`${hand}: label=${q.label} 期待=${label}`);
      if (q.doraIndicators.length < 1 || q.doraIndicators.length > 2) {
        mismatches.push(`${hand}: ドラ表示${q.doraIndicators.length}枚`);
      }
      // 2枚目の表示牌（新ドラ）はカン出題のときだけ。
      const hasKan = q.melds.some((m) => m.type === "kan_open" || m.type === "kan_closed");
      if (q.doraIndicators.length === 2 && !hasKan) {
        mismatches.push(`${hand}: カン無しでドラ表示2枚`);
      }
    }
    expect(mismatches).toEqual([]);
  });

  it("ツモ/ロンの両方が出題される（20問・シード固定で確認済み）", () => {
    expect(questions.some((q) => q.tsumo)).toBe(true);
    expect(questions.some((q) => !q.tsumo)).toBe(true);
  });
});

// 出題分布の担保（[決定] 2026-07-26 v2: 鳴き・カン0〜3・ドラ/赤・全役を出題可能に）。
// 固定シードの決定的スキャンなので flaky にならない（生成ロジックを変えたときだけ再計算する）。
// シード42の実測（400問・生成18ms。リーチ対応で rng 消費順が変わった 2026-07-26 の再実測）:
// 6翻+=81 / 8翻+=29 / 11翻+=9 / fu>=80=8 / 副露入り=171 / カン入り=62 / ドラ>=1=94 /
// 赤ドラ入り=143 / 親=98・子=302 / リーチ=150 / 役満=8。
describe("点数計算 v2: 出題分布（固定シード42の連続400問スキャン）", () => {
  it("6翻+・8翻+・三倍満級(11翻+)・fu>=80・副露・カン・ドラ・親・子・リーチ有無が各1問以上出る", () => {
    const scanRng = createQuizRng(42);
    const hits = {
      han6: 0,
      han8: 0,
      han11: 0,
      fu80: 0,
      melds: 0,
      kan: 0,
      dora: 0,
      dealer: 0,
      nonDealer: 0,
      riichi: 0,
      noRiichi: 0,
    };
    for (let i = 0; i < 400; i++) {
      const q = generateScoreQuestion(scanRng);
      if (q.han >= 6) hits.han6++;
      if (q.han >= 8) hits.han8++;
      if (q.han >= 11) hits.han11++;
      if (q.fu >= 80) hits.fu80++;
      if (q.melds.length > 0) hits.melds++;
      if (q.melds.some((m) => m.type === "kan_open" || m.type === "kan_closed")) hits.kan++;
      if (q.yaku.some((y) => y.name === "ドラ" && y.han >= 1)) hits.dora++;
      if (q.seatWind === "east") hits.dealer++;
      else hits.nonDealer++;
      if (q.riichi) hits.riichi++;
      else hits.noRiichi++;
    }
    for (const [key, n] of Object.entries(hits)) {
      expect(n, key).toBeGreaterThanOrEqual(1);
    }
  });
});

// リーチ対応（[決定] 2026-07-26 追加。立直1翻・門前のみ・一発/裏ドラは対象外のまま）。
// 門前手（暗槓のみ含む）の約5割に rng で付与し、晒し（pon/chi/kan_open）入りは常に riichi=false。
describe("点数計算 v2: リーチ出題（固定シード20260727の連続60問スキャン）", () => {
  const rng = createQuizRng(20260727);
  const questions = Array.from({ length: 60 }, () => generateScoreQuestion(rng));

  it("riichi=true の出題と false の出題が両方存在する", () => {
    expect(questions.some((q) => q.riichi)).toBe(true);
    expect(questions.some((q) => !q.riichi)).toBe(true);
  });

  it("riichi=true の問題は全て門前（晒しなし。暗槓のみは可）で、役満以外は役に「立直 1翻」が入る", () => {
    const mismatches: string[] = [];
    for (const q of questions.filter((q) => q.riichi)) {
      const hand = q.closedTiles.join("");
      const open = q.melds.filter((m) => m.type !== "kan_closed");
      if (open.length > 0) {
        mismatches.push(`${hand}: 晒しあり（${open.map((m) => m.type).join(",")}）`);
      }
      const yakuman = q.yaku.some((y) => y.han >= 13);
      if (!yakuman && !q.yaku.some((y) => y.name === "立直" && y.han === 1)) {
        mismatches.push(`${hand}: 立直行なし（${JSON.stringify(q.yaku)}）`);
      }
      if (yakuman && q.yaku.some((y) => y.name === "立直")) {
        mismatches.push(`${hand}: 役満なのに立直行あり`);
      }
    }
    expect(mismatches).toEqual([]);
  });

  it("ラベルは riichi=true のときだけ「リーチ」を含み、位置はツモ/ロンの前", () => {
    const mismatches: string[] = [];
    for (const q of questions) {
      const hand = q.closedTiles.join("");
      if (q.riichi) {
        if (!q.label.includes(`・リーチ・${q.tsumo ? "ツモ" : "ロン"}・`)) {
          mismatches.push(`${hand}: label=${q.label}`);
        }
      } else if (q.label.includes("リーチ")) {
        mismatches.push(`${hand}: riichi=false なのに label=${q.label}`);
      }
    }
    expect(mismatches).toEqual([]);
  });
});

describe("scoreYakuLine（見直しリストの役内訳1行）", () => {
  it("役は「名前 n翻」・ドラ/赤ドラは「ドラn」表記で「・」区切り、末尾に計◯翻◯符", () => {
    expect(
      scoreYakuLine({
        yaku: [
          { name: "断幺九", han: 1 },
          { name: "ドラ", han: 2 },
          { name: "赤ドラ", han: 1 },
        ],
        han: 4,
        fu: 30,
      }),
    ).toBe("断幺九 1翻・ドラ2・赤ドラ1・計4翻30符");
  });

  it("役満は役名のみ並べて末尾は「役満」（翻符を出さない）", () => {
    expect(scoreYakuLine({ yaku: [{ name: "大三元", han: 13 }], han: 13, fu: 40 })).toBe(
      "大三元・役満",
    );
    expect(
      scoreYakuLine({
        yaku: [
          { name: "字一色", han: 13 },
          { name: "大四喜", han: 13 },
        ],
        han: 26,
        fu: 40,
      }),
    ).toBe("字一色・大四喜・役満");
  });
});

// v1 の「意図した分解（ScoreHand）」ベースの固定ケースは、v2 でエンジン（score-engine.test.ts）
// の固定ケースへ付け替え済み（1翻40符/平和ツモ20符/親ツモ2000オール/大明槓の門前喪失/
// 80符/100符/110符 いずれもエンジン側で担保）。ここには QUIZ_SCORE_RULES（切り上げ満貫なし）
// そのものの支払い検証だけを残す。
describe("点数計算クイズ: 支払いの固定ケース（QUIZ_SCORE_RULES=切り上げ満貫なし）", () => {
  // 親（◯点オール）と子（子◯ / 親◯）の両表記を焼き付ける（[決定] 2026-07-26 オーナー指示:
  // 親と子での点数計算を必ず出題・検証する）。
  it.each([
    { name: "親ツモ3翻30符", han: 3, fu: 30, dealer: true, pay: "2000点オール" },
    { name: "子ツモ2翻40符", han: 2, fu: 40, dealer: false, pay: "子700 / 親1300" },
    { name: "親ツモ跳満", han: 6, fu: 30, dealer: true, pay: "6000点オール" },
    { name: "子ツモ満貫", han: 5, fu: 30, dealer: false, pay: "子2000 / 親4000" },
  ])("$name = $pay", ({ han, fu, dealer, pay }) => {
    expect(payText(handScore({ han, fu, dealer, tsumo: true }, QUIZ_SCORE_RULES))).toBe(pay);
  });

  // 切り上げ満貫なし（QUIZ_SCORE_RULES）だからこそ出る古典的な点数を焼き付ける。
  it.each([
    { name: "子ロン4翻30符", han: 4, fu: 30, dealer: false, pay: "7700点" },
    { name: "親ロン4翻30符", han: 4, fu: 30, dealer: true, pay: "11600点" },
    { name: "子ロン2翻110符", han: 2, fu: 110, dealer: false, pay: "7100点" },
  ])("$name = $pay（kiriage:false）", ({ han, fu, dealer, pay }) => {
    expect(payText(handScore({ han, fu, dealer, tsumo: false }, QUIZ_SCORE_RULES))).toBe(pay);
    // 対比: Mリーグ既定（kiriage:true）では 4翻30符 は満貫 8000/12000 になる。
    if (han === 4 && fu === 30) {
      expect(payText(handScore({ han, fu, dealer, tsumo: false }, RulesSchema.parse({})))).toBe(
        dealer ? "12000点" : "8000点",
      );
    }
  });

  it("3翻110符は基本点が2000を超えるため満貫に切り詰める（kiriage:false でも正しい挙動）", () => {
    const s = handScore({ han: 3, fu: 110, dealer: false, tsumo: false }, QUIZ_SCORE_RULES);
    expect(s.limit).toBe("満貫");
    expect(payText(s)).toBe("8000点");
  });
});

describe("試行上限（品質フィルタを満たせない場合は Error）", () => {
  it("既定の試行上限は10000回", () => {
    expect(QUIZ_MAX_GENERATION_ATTEMPTS).toBe(10000);
  });

  it.each([
    // rng が常に同じ値(0.1) → 毎回同じ手 → 品質フィルタに落ち続けて上限到達（実測で確認済み）。
    // 点数計算は常に平和モード＆全ブロック123mになり、同スート隔離フィルタに落ち続ける。
    { name: "清一色", run: () => generateChinitsuQuestion(() => 0.1, 30) },
    { name: "牌効率", run: () => generateEfficiencyQuestion(() => 0.1, 30) },
    { name: "点数計算", run: () => generateScoreQuestion(() => 0.1, 30) },
  ])("$name: フィルタを満たせない乱数では上限到達で Error を投げる", ({ run }) => {
    expect(run).toThrowError(/試行上限/);
  });
});
