// ============================================================
// eval — AI読み取り精度の指標（純粋関数）
// ------------------------------------------------------------
// 予測 Kifu と正解(ラベル) Kifu を比較し、設計ドキュメント 4章の3指標を出す。
//   ① 牌単位の正解率（tileAccuracy。河は index 整列なので順序も反映）
//   ② 「confidence 高いのに誤読」率（highConfWrongRate。最重要・低いほど良い）
//   ③ リーチ牌の正解率（riichiAccuracy。リーチフラグ一致）
//
// 実運用: ラベル付きテスト画像 → 解析(GeminiAnalyzer) → 予測 Kifu を得て、
//        正解 Kifu と evaluateKifu で比較、aggregate でデータセット全体を集計する。
//        （画像と実 Gemini が要るので、ここは比較ロジックのみ。runner は別途。）
// ============================================================

import type { Kifu, Seat, Tile } from "@rigel/schema";

const SEAT_ORDER: Seat[] = ["east", "south", "west", "north"];
export const DEFAULT_CONFIDENCE_THRESHOLD = 0.8;

interface Cell {
  key: string;
  tile: Tile | null;
  confidence: number;
  /** 河の牌のみ true/false。手牌・鳴きは null。 */
  riichi: boolean | null;
}

function extractCells(kifu: Kifu): Cell[] {
  const cells: Cell[] = [];
  for (const seat of SEAT_ORDER) {
    const board = kifu.seats[seat];
    board.hand.forEach((t, i) =>
      cells.push({
        key: `${seat}:hand::${i}`,
        tile: t.tile,
        confidence: t.confidence,
        riichi: null,
      }),
    );
    board.melds.forEach((m, mi) =>
      m.tiles.forEach((t, i) =>
        cells.push({
          key: `${seat}:meld:${mi}:${i}`,
          tile: t.tile,
          confidence: t.confidence,
          riichi: null,
        }),
      ),
    );
    board.river.forEach((d, i) =>
      cells.push({
        key: `${seat}:river::${i}`,
        tile: d.tile,
        confidence: d.confidence,
        riichi: d.riichi,
      }),
    );
  }
  return cells;
}

export interface AccuracyResult {
  /** 比較した牌数（正解ベース）。 */
  tiles: number;
  tileCorrect: number;
  tileAccuracy: number;
  /** confidence 高（>=閾値）なのに誤読。 */
  highConfWrong: number;
  highConfTotal: number;
  highConfWrongRate: number;
  riichiCorrect: number;
  riichiTotal: number;
  riichiAccuracy: number;
}

function rate(numerator: number, denominator: number): number {
  return denominator === 0 ? 1 : numerator / denominator;
}

/** 予測と正解の Kifu を比較して3指標を出す。位置(席/領域/index)で揃える。 */
export function evaluateKifu(
  predicted: Kifu,
  expected: Kifu,
  threshold = DEFAULT_CONFIDENCE_THRESHOLD,
): AccuracyResult {
  const predMap = new Map(extractCells(predicted).map((c) => [c.key, c]));
  const expected_ = extractCells(expected);

  let tiles = 0;
  let tileCorrect = 0;
  let highConfWrong = 0;
  let highConfTotal = 0;
  let riichiTotal = 0;
  let riichiCorrect = 0;

  for (const e of expected_) {
    tiles += 1;
    const p = predMap.get(e.key);
    const predTile = p?.tile ?? null;
    const confidence = p?.confidence ?? 0;
    const correct = predTile === e.tile;
    if (correct) tileCorrect += 1;

    if (confidence >= threshold) {
      highConfTotal += 1;
      if (!correct) highConfWrong += 1; // 自信満々の誤読
    }

    if (e.riichi !== null) {
      riichiTotal += 1;
      if ((p?.riichi ?? false) === e.riichi) riichiCorrect += 1;
    }
  }

  return {
    tiles,
    tileCorrect,
    tileAccuracy: rate(tileCorrect, tiles),
    highConfWrong,
    highConfTotal,
    highConfWrongRate: rate(highConfWrong, highConfTotal),
    riichiCorrect,
    riichiTotal,
    riichiAccuracy: rate(riichiCorrect, riichiTotal),
  };
}

/** 複数局の結果をデータセット全体として集計する（件数を足してから率を出し直す）。 */
export function aggregate(results: AccuracyResult[]): AccuracyResult {
  const sum = results.reduce(
    (a, r) => ({
      tiles: a.tiles + r.tiles,
      tileCorrect: a.tileCorrect + r.tileCorrect,
      highConfWrong: a.highConfWrong + r.highConfWrong,
      highConfTotal: a.highConfTotal + r.highConfTotal,
      riichiCorrect: a.riichiCorrect + r.riichiCorrect,
      riichiTotal: a.riichiTotal + r.riichiTotal,
    }),
    {
      tiles: 0,
      tileCorrect: 0,
      highConfWrong: 0,
      highConfTotal: 0,
      riichiCorrect: 0,
      riichiTotal: 0,
    },
  );
  return {
    ...sum,
    tileAccuracy: rate(sum.tileCorrect, sum.tiles),
    highConfWrongRate: rate(sum.highConfWrong, sum.highConfTotal),
    riichiAccuracy: rate(sum.riichiCorrect, sum.riichiTotal),
  };
}
