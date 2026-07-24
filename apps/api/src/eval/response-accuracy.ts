// ============================================================
// eval — AI応答（河1方向 / 手牌1人分）を正解ラベルと突き合わせる
// ------------------------------------------------------------
// accuracy.ts は Kifu 同士の比較だが、eval-fixtures は読み取り単位
// （河1方向・手牌1人分）でラベルするため、応答レベルの採点を提供する。
// 指標は同じ AccuracyResult（aggregate で合算できる）。
// 位置(index)で整列し、予測欠落は tile: null とみなす。
// 鳴きの type / from は牌指標と混ぜず warnings で報告する。
// ============================================================

import type { AiHandResponse, AiRiverResponse } from "@rigel/schema";
import { accuracyRate, misreadRateOf, type AccuracyResult } from "./accuracy";
import type { TruthHandTarget, TruthTile } from "./truth";

interface PredCell {
  tile: AiRiverResponse["discards"][number]["tile"];
  riichi: boolean | null;
}

interface ExpCell {
  tile: TruthTile["tile"];
  riichi: boolean | null;
}

export interface TargetEvaluation {
  result: AccuracyResult;
  warnings: string[];
}

/** 正解セル列 vs 予測セル列（index 整列）で3指標を出す。
 *  surplus = 正解に無い位置へ出された牌コードの数（発明）。misread に数える。 */
function compareCells(
  expected: ExpCell[],
  predicted: (PredCell | undefined)[],
  surplus = 0,
): AccuracyResult {
  let tileCorrect = 0;
  let misread = surplus;
  let asserted = surplus;
  let riichiTotal = 0;
  let riichiCorrect = 0;

  expected.forEach((e, i) => {
    const p = predicted[i];
    const predTile = p?.tile ?? null;
    const correct = predTile === e.tile;
    if (correct) tileCorrect += 1;

    if (predTile !== null) {
      asserted += 1;
      if (!correct) misread += 1; // 白旗なしの誤読（最重要指標）
    }

    if (e.riichi !== null) {
      riichiTotal += 1;
      if ((p?.riichi ?? false) === e.riichi) riichiCorrect += 1;
    }
  });

  return {
    tiles: expected.length,
    tileCorrect,
    tileAccuracy: accuracyRate(tileCorrect, expected.length),
    misread,
    asserted,
    misreadRate: misreadRateOf(misread, asserted),
    riichiCorrect,
    riichiTotal,
    riichiAccuracy: accuracyRate(riichiCorrect, riichiTotal),
  };
}

/** 河1方向: 正解トークン列 vs AiRiverResponse（order で整列してから比較）。 */
export function evaluateRiverTarget(
  expected: TruthTile[],
  predicted: AiRiverResponse,
): TargetEvaluation {
  const sorted = [...predicted.discards].sort((a, b) => a.order - b.order);
  const warnings: string[] = [];
  if (sorted.length !== expected.length) {
    warnings.push(`捨て牌の枚数が不一致: 正解 ${expected.length} 枚 / 予測 ${sorted.length} 枚`);
  }
  // 正解より多く読まれた余剰スロットのうち、牌コードを出したもの＝発明。
  const surplus = sorted.slice(expected.length).filter((d) => d.tile !== null).length;
  const result = compareCells(
    expected.map((e) => ({ tile: e.tile, riichi: e.riichi })),
    sorted.map((d) => ({ tile: d.tile, riichi: d.riichi })),
    surplus,
  );
  return { result, warnings };
}

/** 手牌1人分: 正解（hand+melds） vs AiHandResponse。type/from の不一致は warnings。 */
export function evaluateHandTarget(
  expected: Pick<TruthHandTarget, "hand" | "melds">,
  predicted: AiHandResponse,
): TargetEvaluation {
  const warnings: string[] = [];
  if (predicted.melds.length !== expected.melds.length) {
    warnings.push(
      `鳴きの数が不一致: 正解 ${expected.melds.length} / 予測 ${predicted.melds.length}`,
    );
  }
  expected.melds.forEach((em, i) => {
    const pm = predicted.melds[i];
    if (!pm) return; // 欠落は牌セル側で誤り扱いになる
    if (pm.type !== em.type) {
      warnings.push(`鳴き#${i + 1}: type 不一致（正解 ${em.type} / 予測 ${pm.type}）`);
    }
    if (pm.from !== em.from) {
      warnings.push(`鳴き#${i + 1}: from 不一致（正解 ${em.from} / 予測 ${pm.from}）`);
    }
  });

  const expectedCells: ExpCell[] = [
    ...expected.hand.map((t) => ({ tile: t.tile, riichi: null })),
    ...expected.melds.flatMap((m) => m.tiles.map((t) => ({ tile: t.tile, riichi: null }))),
  ];
  const predictedCells: PredCell[] = [
    ...predicted.hand.map((t) => ({ tile: t.tile, riichi: null })),
    ...predicted.melds.flatMap((m) => m.tiles.map((t) => ({ tile: t.tile, riichi: null }))),
  ];
  // 手牌の枚数ずれで鳴き牌まで丸ごとずれると指標が壊れるため、領域ごとに整列する。
  const handLen = expected.hand.length;
  const predHand = predictedCells.slice(0, predicted.hand.length);
  const predMelds = predictedCells.slice(predicted.hand.length);
  const aligned: (PredCell | undefined)[] = [...padTo(predHand, handLen), ...predMelds];
  if (predicted.hand.length !== handLen) {
    warnings.push(`手牌の枚数が不一致: 正解 ${handLen} 枚 / 予測 ${predicted.hand.length} 枚`);
  }
  // 正解に無い位置へ出された牌コード＝発明（手牌の溢れ・余分な鳴き牌）。
  const surplus =
    predHand.slice(handLen).filter((c) => c.tile !== null).length +
    aligned.slice(expectedCells.length).filter((c) => c?.tile != null).length;
  const result = compareCells(expectedCells, aligned, surplus);
  return { result, warnings };
}

function padTo(cells: PredCell[], length: number): (PredCell | undefined)[] {
  const out: (PredCell | undefined)[] = cells.slice(0, length);
  while (out.length < length) out.push(undefined);
  return out;
}
