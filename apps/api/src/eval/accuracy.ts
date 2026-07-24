// ============================================================
// eval — AI読み取り精度の指標（純粋関数）
// ------------------------------------------------------------
// 予測 Kifu と正解(ラベル) Kifu を比較し、設計ドキュメント 4章の3指標を出す。
//   ① 牌単位の正解率（tileAccuracy。河は index 整列なので順序も反映）
//   ② 白旗なし誤読率（misreadRate。null を出さずに間違えた率。最重要・低いほど良い。
//      数値 confidence は廃止（[決定] 2026-07-24）のため「牌コードを出した＝自信あり」とみなす）
//   ③ リーチ牌の正解率（riichiAccuracy。リーチフラグ一致）
//
// 実運用: ラベル付きテスト画像 → 解析(GeminiAnalyzer) → 予測 Kifu を得て、
//        正解 Kifu と evaluateKifu で比較、aggregate でデータセット全体を集計する。
//        （画像と実 Gemini が要るので、ここは比較ロジックのみ。runner は eval/runner。）
// ============================================================

import type { Kifu, Seat, Tile } from "@rigel/schema";

const SEAT_ORDER: Seat[] = ["east", "south", "west", "north"];

interface Cell {
  key: string;
  tile: Tile | null;
  /** 河の牌のみ true/false。手牌・鳴きは null。 */
  riichi: boolean | null;
}

function extractCells(kifu: Kifu): Cell[] {
  const cells: Cell[] = [];
  for (const seat of SEAT_ORDER) {
    const board = kifu.seats[seat];
    board.hand.forEach((t, i) =>
      cells.push({ key: `${seat}:hand::${i}`, tile: t.tile, riichi: null }),
    );
    board.melds.forEach((m, mi) =>
      m.tiles.forEach((t, i) =>
        cells.push({ key: `${seat}:meld:${mi}:${i}`, tile: t.tile, riichi: null }),
      ),
    );
    board.river.forEach((d, i) =>
      cells.push({ key: `${seat}:river::${i}`, tile: d.tile, riichi: d.riichi }),
    );
  }
  return cells;
}

export interface AccuracyResult {
  /** 比較した牌数（正解ベース）。 */
  tiles: number;
  tileCorrect: number;
  tileAccuracy: number;
  /** 牌コードを出した（=null で白旗を揚げなかった）のに誤読。 */
  misread: number;
  /** 牌コードを出した数（分母）。 */
  asserted: number;
  misreadRate: number;
  riichiCorrect: number;
  riichiTotal: number;
  riichiAccuracy: number;
}

/** 「高いほど良い」率（正解率系）。空データは満点扱い。 */
export function accuracyRate(numerator: number, denominator: number): number {
  return denominator === 0 ? 1 : numerator / denominator;
}

/** 「低いほど良い」率（misreadRate）。主張ゼロ（全白旗・空ターゲット）は 0＝最良。
 *  accuracyRate と混用すると「最も慎重な白旗に最悪スコア」の逆転が起きるため分離する。 */
export function misreadRateOf(misread: number, asserted: number): number {
  return asserted === 0 ? 0 : misread / asserted;
}

/** 予測と正解の Kifu を比較して3指標を出す。位置(席/領域/index)で揃える。 */
export function evaluateKifu(predicted: Kifu, expected: Kifu): AccuracyResult {
  const predCells = extractCells(predicted);
  const predMap = new Map(predCells.map((c) => [c.key, c]));
  const expected_ = extractCells(expected);
  const expectedKeys = new Set(expected_.map((c) => c.key));

  let tiles = 0;
  let tileCorrect = 0;
  let misread = 0;
  let asserted = 0;
  let riichiTotal = 0;
  let riichiCorrect = 0;

  for (const e of expected_) {
    tiles += 1;
    const p = predMap.get(e.key);
    const predTile = p?.tile ?? null;
    const correct = predTile === e.tile;
    if (correct) tileCorrect += 1;

    if (predTile !== null) {
      asserted += 1;
      if (!correct) misread += 1; // 白旗なしの誤読（最重要・低いほど良い）
    }

    if (e.riichi !== null) {
      riichiTotal += 1;
      if ((p?.riichi ?? false) === e.riichi) riichiCorrect += 1;
    }
  }

  // 正解に存在しない位置へ牌コードを出した＝発明（Never invent a tile 違反）も誤読に数える。
  for (const p of predCells) {
    if (!expectedKeys.has(p.key) && p.tile !== null) {
      asserted += 1;
      misread += 1;
    }
  }

  return {
    tiles,
    tileCorrect,
    tileAccuracy: accuracyRate(tileCorrect, tiles),
    misread,
    asserted,
    misreadRate: misreadRateOf(misread, asserted),
    riichiCorrect,
    riichiTotal,
    riichiAccuracy: accuracyRate(riichiCorrect, riichiTotal),
  };
}

/** 複数局の結果をデータセット全体として集計する（件数を足してから率を出し直す）。 */
export function aggregate(results: AccuracyResult[]): AccuracyResult {
  const sum = results.reduce(
    (a, r) => ({
      tiles: a.tiles + r.tiles,
      tileCorrect: a.tileCorrect + r.tileCorrect,
      misread: a.misread + r.misread,
      asserted: a.asserted + r.asserted,
      riichiCorrect: a.riichiCorrect + r.riichiCorrect,
      riichiTotal: a.riichiTotal + r.riichiTotal,
    }),
    { tiles: 0, tileCorrect: 0, misread: 0, asserted: 0, riichiCorrect: 0, riichiTotal: 0 },
  );
  return {
    ...sum,
    tileAccuracy: accuracyRate(sum.tileCorrect, sum.tiles),
    misreadRate: misreadRateOf(sum.misread, sum.asserted),
    riichiAccuracy: accuracyRate(sum.riichiCorrect, sum.riichiTotal),
  };
}
