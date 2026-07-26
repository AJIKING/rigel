// 受け入れ計算（特訓クイズ「牌効率」の採点基盤。web/mobile 共有）。
// shanten.ts / tenpai.ts と同じ counts（34種・赤5正規化）を土台に、
// 3n+2 枚の手について打牌ごとの受け入れ（種類×残り枚数）を返す。
// 残り枚数は「4 − 自分の手牌内の使用枚数」のみ（場況＝河・副露の控除は v1 では見ない）。

import { TILE_VALUES, type Tile } from "@rigel/schema";
import { shanten } from "./shanten";
import { winningTiles } from "./tenpai";
import { CANDIDATE_TILES, tileIndex, toCounts } from "./tile-counts";

export interface DiscardUkeire {
  /** 切る牌（手牌の実コード。赤5は 0x のまま）。 */
  discard: Tile;
  /** 切った後の向聴数。 */
  shanten: number;
  /** 受け入れ牌（向聴が進む牌種。赤抜き34種・TILE_VALUES 順）。 */
  tiles: Tile[];
  /** 受け入れ枚数（Σ 4 − 自分の手牌内の使用枚数。赤5は5と同一視して数える）。 */
  count: number;
}

/** 牌コードの表示順（同率打牌の並び・bestDiscards の順序に使う）。 */
function tileOrder(tile: Tile): number {
  return TILE_VALUES.indexOf(tile);
}

/** 重複を除いた打牌候補（切る牌と、切った後の 3n+1 枚）。 */
function discardOptions(tiles: readonly Tile[]): { discard: Tile; rest: Tile[] }[] {
  const seen = new Set<Tile>();
  const out: { discard: Tile; rest: Tile[] }[] = [];
  for (let i = 0; i < tiles.length; i++) {
    const discard = tiles[i]!;
    if (seen.has(discard)) continue;
    seen.add(discard);
    out.push({ discard, rest: tiles.filter((_, j) => j !== i) });
  }
  return out;
}

/** 1打牌ぶんの受け入れ。after（切った後の向聴）は呼び出し側が計算済みのものを渡す。 */
function ukeireOf(
  discard: Tile,
  rest: readonly Tile[],
  after: number,
  meldCount: number,
  candidates: readonly Tile[],
): DiscardUkeire {
  const counts = toCounts(rest);
  // テンパイ（0向聴）の打牌は「向聴が1つ進む牌」＝和了牌なので winningTiles で決まる。
  // 和了判定は向聴計算より一桁速く（単色13枚で 0.03ms vs 0.29ms）、清一色のように
  // 牌種が密集した手では総当たりが重い。**待ちは打牌ごとに1回だけ**求める
  // （候補ごとに呼ぶと高速化にならない）。同値は ukeire.test.ts で固定している。
  const waits = after === 0 ? new Set(winningTiles(rest)) : null;
  const advances = (t: Tile) =>
    waits ? waits.has(t) : shanten([...rest, t], meldCount) === after - 1;
  const accepted: Tile[] = [];
  let count = 0;
  for (const candidate of candidates) {
    // 赤5（0x）は受け入れの牌種として数えない（5x で代表する）。牌種インデックスは
    // 共有の tileIndex（O(1)）を使う — CANDIDATE_TILES.indexOf は34件の線形探索。
    if (candidate[0] === "0") continue;
    const k = tileIndex(candidate);
    if (counts[k]! >= 4) continue; // 5枚目は存在しない
    if (advances(candidate)) {
      accepted.push(candidate);
      count += 4 - counts[k]!;
    }
  }
  return { discard, shanten: after, tiles: accepted, count };
}

/** 表示順（向聴数が小さい順 → count が大きい順 → 牌コード順）。 */
function byShantenThenCount(a: DiscardUkeire, b: DiscardUkeire): number {
  return a.shanten - b.shanten || b.count - a.count || tileOrder(a.discard) - tileOrder(b.discard);
}

/**
 * 3n+2 枚の手について、重複を除いた各打牌の受け入れを返す。
 * 受け入れ = 切った後の 3n+1 枚に加えると向聴数が1つ進む牌種（既定は34種総当たり。0x は候補にしない）。
 * 0m と 5m は別の打牌候補として両方返す（正規化すれば同じ手なので効率は同値になる）。
 * 並びは「向聴数が小さい順 → count が大きい順 → 牌コード順」。
 * 副露がある手は meldCount（省略時 0）で部分手として評価し、
 * 手牌枚数 + 3×meldCount が 14 にならない手は判定できないので空配列を返す。
 *
 * candidates で受け入れとして数える牌種を絞れる（省略時は34種）。清一色の出題は
 * 「同色だけで広くなるか」を問うので同色9種に絞る — 絞らないと七対子経由で他色が
 * 受け入れに入り、正解の根拠が題材から外れる。**向聴数は candidates に影響されない**
 * （切った後の手そのものの向聴なので、数える牌種を減らしても変わらない）。
 */
export function discardUkeires(
  tiles: readonly Tile[],
  meldCount = 0,
  candidates: readonly Tile[] = CANDIDATE_TILES,
): DiscardUkeire[] {
  if (!Number.isInteger(meldCount) || meldCount < 0) return [];
  if (tiles.length + meldCount * 3 !== 14) return [];
  return discardOptions(tiles)
    .map((o) => ukeireOf(o.discard, o.rest, shanten(o.rest, meldCount), meldCount, candidates))
    .sort(byShantenThenCount);
}

/**
 * 最小向聴を保つ打牌だけの受け入れ（返るエントリは discardUkeires と同一・向聴戻しは含まない）。
 *
 * 受け入れ計算は打牌ごとに「候補種類 × 向聴計算」を回すので、清一色のように向聴計算が
 * 重い手（単色13枚で 1回 0.3ms）では全14打牌ぶん回すと数十msかかる。出題の正解判定にも
 * 見直し表示にも**向聴戻しの打牌の受け入れは要らない**ので、先に全打牌の向聴だけを出して
 * 枝刈りする（向聴計算1回 × 打牌数で済む）。正解の物差し（bestUkeires）は変えない。
 */
export function keepUkeires(
  tiles: readonly Tile[],
  meldCount = 0,
  candidates: readonly Tile[] = CANDIDATE_TILES,
): DiscardUkeire[] {
  if (!Number.isInteger(meldCount) || meldCount < 0) return [];
  if (tiles.length + meldCount * 3 !== 14) return [];
  const withShanten = discardOptions(tiles).map((o) => ({
    ...o,
    after: shanten(o.rest, meldCount),
  }));
  const min = Math.min(...withShanten.map((o) => o.after));
  return withShanten
    .filter((o) => o.after === min)
    .map((o) => ukeireOf(o.discard, o.rest, o.after, meldCount, candidates))
    .sort(byShantenThenCount);
}

/**
 * 見直し用: discardUkeires の結果から正解集合（「まず最小向聴を保つ」打牌のうち
 * 受け入れ枚数が最大のもの。同率は全部）のエントリを返す。
 * 「最小向聴かつ受け入れ最大」の判定はここに一元化し、bestDiscards /
 * generateEfficiencyQuestion の answer / 結果画面の受け入れ詳細（web/mobile）が共有する。
 * エントリは入力のオブジェクトをそのまま返し（再計算しない）、並びは入力順を保つ。
 */
export function bestUkeires(ukeires: readonly DiscardUkeire[]): DiscardUkeire[] {
  if (ukeires.length === 0) return [];
  const minShanten = Math.min(...ukeires.map((u) => u.shanten));
  const keep = ukeires.filter((u) => u.shanten === minShanten);
  const maxCount = Math.max(...keep.map((u) => u.count));
  return keep.filter((u) => u.count === maxCount);
}

/**
 * 正解集合 = 「まず最小向聴を保つ」打牌のうち受け入れ枚数が最大のもの（同率は全部）。
 * 向聴戻しの打牌は受け入れが多くても正解に入らない。並びは discardUkeires と同じ（牌コード順）。
 */
export function bestDiscards(tiles: readonly Tile[], meldCount = 0): Tile[] {
  return bestUkeires(discardUkeires(tiles, meldCount)).map((u) => u.discard);
}

/** 特訓の見直し行（受け入れ詳細）のヘッドレス計算結果。 */
export interface UkeireReviewModel {
  /** 最小向聴を保つ打牌の受け入れ（keepUkeires と同一。向聴戻しは mine にだけ出る）。 */
  ukeires: DiscardUkeire[];
  /** 最小向聴（不正枚数の手は undefined）。 */
  minShanten: number | undefined;
  /** あなたの回答（切った牌）のエントリ（回答なし・手牌に無い牌は undefined）。 */
  mine: DiscardUkeire | undefined;
  /** あなたの回答が最小向聴を保っていない（=「向聴戻し」バッジを出す）。 */
  regressed: boolean;
  /** 正解集合のエントリ（bestUkeires と同一）。 */
  best: DiscardUkeire[];
}

/**
 * 特訓の見直し行に出す受け入れ詳細の計算（web/mobile の UkeireDetail が共有する
 * ヘッドレスモデル。2026-07-26 に画面側の二重実装を解消）。
 * 「最小向聴かつ受け入れ最大」の判定は bestUkeires に一元化したまま、
 * あなたの回答のエントリと向聴戻し判定までをここでまとめて返す。
 */
export function ukeireReviewModel(
  tiles: readonly Tile[],
  picked: Tile | null,
  candidates?: readonly Tile[],
): UkeireReviewModel {
  // candidates は出題時と同じものを渡す（清一色 何切るは同色9種）。ここがズレると
  // 「出題では正解だった打牌が、見直しでは不正解に見える」という最悪の齟齬になる。
  //
  // 表示に要るのは「正解集合」と「あなたの回答」の2つだけなので、まず最小向聴の打牌だけを
  // 計算し（keepUkeires）、回答が向聴戻しでそこに無いときだけ1件を追加で計算する。
  // 全14打牌ぶん回すと清一色の結果画面が数百ms〜1秒ブロックする。
  const ukeires = keepUkeires(tiles, 0, candidates);
  const minShanten = ukeires[0]?.shanten;
  const kept = picked === null ? undefined : ukeires.find((u) => u.discard === picked);
  const regressedEntry =
    picked === null || kept !== undefined
      ? undefined
      : discardUkeires(tiles, 0, candidates).find((u) => u.discard === picked);
  const mine = kept ?? regressedEntry;
  return {
    ukeires,
    minShanten,
    mine,
    regressed: mine !== undefined && mine.shanten !== minShanten,
    best: bestUkeires(ukeires),
  };
}
