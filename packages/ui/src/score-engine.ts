// ============================================================
// 採点エンジン v2（点数計算クイズの心臓部）
// ------------------------------------------------------------
// 任意の和了手（門前部分＋副露＋和了牌＋状況）を受け取り、標準形の全分解×
// 和了牌の所属（待ち形）を列挙して役・符を判定し、高点法（支払い合計が最大、
// 同点なら翻が大きい方）で1つの解釈を返す。
// - リーチは ctx.riichi で対象（立直1翻・門前のみ。晒しがあるのに riichi=true は null）。
// - 対象外: 一発・その他の状況役（海底/河底/嶺上/搶槓・天和/地和）と裏ドラ
//   （クイズの前提。一発なし・裏ドラなし）。
// - 最終段の「翻符→支払い」は score.ts の handScore に一元化（二重実装しない）。
// - 無役（ドラのみを含む）・和了形不成立・入力不正は null（採点不能）。
// quiz.ts の点数計算クイズ v2（generateScoreQuestion）はこのエンジンに採点を全委譲する
// （v1 の scoreHandFu/scoreHandHan は 2026-07-26 に統合・削除済み）。
// ============================================================

import type { MeldType, Rules, Seat, Tile } from "@rigel/schema";
import { handScore, type HandScore } from "./score";
import { KOKUSHI, tileIndex, toCounts } from "./tile-counts";

export interface AgariContext {
  /** 門前部分の牌（和了牌を含む。3n+2 枚相当）。 */
  closedTiles: readonly Tile[];
  /** 副露（pon/chi/kan_open/kan_added は晒し・kan_closed は暗槓=門前維持）。 */
  melds: readonly { type: MeldType; tiles: Tile[] }[];
  /** 和了牌（closedTiles に含まれていること）。 */
  winTile: Tile;
  tsumo: boolean;
  /** 自風（east=親）。 */
  seatWind: Seat;
  /** 場風。 */
  roundWind: Seat;
  /** ドラ表示牌（表示牌の次がドラ。裏ドラなし前提）。 */
  doraIndicators: readonly Tile[];
  /** 立直（1翻・門前のみ。晒しがある手で true は不正入力として null。一発・裏ドラは対象外）。 */
  riichi?: boolean;
}

export interface AgariScoreResult {
  han: number;
  fu: number;
  /** 役の内訳（名前+翻。ドラ・赤ドラも行として含める。見直し画面の解説用）。 */
  yaku: { name: string; han: number }[];
  /** handScore（score.ts）に接続した最終点数。 */
  score: HandScore;
}

// 牌種インデックス（0-8=萬 9-17=筒 18-26=索 27-33=字）は tile-counts.ts の tileIndex を使う。
const WIND_INDEX: Record<Seat, number> = { east: 27, south: 28, west: 29, north: 30 };
const DRAGON_BASE = 31; // 31=白 32=發 33=中
const DRAGON_NAMES = ["役牌 白", "役牌 發", "役牌 中"] as const;

/** 幺九牌（1・9・字牌）か。 */
function isYaochuIdx(i: number): boolean {
  return i >= 27 || i % 9 === 0 || i % 9 === 8;
}

// ------------------------------------------------------------
// ブロック（面子）表現
// ------------------------------------------------------------
type Wait = "ryanmen" | "kanchan" | "penchan" | "shanpon" | "tanki";

interface Block {
  type: "shuntsu" | "koutsu" | "kan";
  /** shuntsu=起点、koutsu/kan=構成牌の牌種インデックス。 */
  i: number;
  /** 晒しているか（pon/chi/kan_open/kan_added。暗槓は false）。 */
  open: boolean;
  /** 暗刻・暗槓扱いか（符と三暗刻/四暗刻の数え方。ロンのシャンポン完成刻子は false）。 */
  concealed: boolean;
}

/** 副露をブロックへ（構成が面子として不正なら null）。 */
function meldToBlock(meld: { type: MeldType; tiles: Tile[] }): Block | null {
  const idxs = meld.tiles.map(tileIndex);
  if (meld.type === "chi") {
    if (idxs.length !== 3) return null;
    const s = [...idxs].sort((a, b) => a - b);
    if (s[0]! >= 27 || s[0]! % 9 > 6 || s[1] !== s[0]! + 1 || s[2] !== s[0]! + 2) return null;
    return { type: "shuntsu", i: s[0]!, open: true, concealed: false };
  }
  const size = meld.type === "pon" ? 3 : 4;
  if (idxs.length !== size || idxs.some((i) => i !== idxs[0])) return null;
  if (meld.type === "pon") return { type: "koutsu", i: idxs[0]!, open: true, concealed: false };
  const closed = meld.type === "kan_closed";
  return { type: "kan", i: idxs[0]!, open: !closed, concealed: closed };
}

// ------------------------------------------------------------
// 門前部分の全分解列挙（counts ベースの再帰。雀頭を全候補で試す）
// ------------------------------------------------------------
interface ClosedSet {
  type: "shuntsu" | "koutsu";
  i: number;
}

interface Decomp {
  pair: number;
  sets: ClosedSet[];
}

function walkSets(c: number[], i: number, acc: ClosedSet[], emit: (sets: ClosedSet[]) => void) {
  while (i < 34 && c[i] === 0) i++;
  if (i === 34) {
    emit([...acc]);
    return;
  }
  if (c[i]! >= 3) {
    c[i]! -= 3;
    acc.push({ type: "koutsu", i });
    walkSets(c, i, acc, emit);
    acc.pop();
    c[i]! += 3;
  }
  if (i < 27 && i % 9 <= 6 && c[i + 1]! > 0 && c[i + 2]! > 0) {
    c[i]!--;
    c[i + 1]!--;
    c[i + 2]!--;
    acc.push({ type: "shuntsu", i });
    walkSets(c, i, acc, emit);
    acc.pop();
    c[i]!++;
    c[i + 1]!++;
    c[i + 2]!++;
  }
}

/** 門前部分（3n+2 枚）の標準形分解をすべて列挙する。 */
function decomposeClosed(counts: number[]): Decomp[] {
  const out: Decomp[] = [];
  const c = [...counts];
  for (let p = 0; p < 34; p++) {
    if (c[p]! < 2) continue;
    c[p]! -= 2;
    walkSets(c, 0, [], (sets) => out.push({ pair: p, sets }));
    c[p]! += 2;
  }
  return out;
}

// ------------------------------------------------------------
// 解釈（分解 × 和了牌の所属）
// ------------------------------------------------------------
interface Interp {
  form: "standard" | "chiitoi" | "kokushi";
  /** standard のみ意味を持つ（副露＋門前ブロック）。 */
  blocks: Block[];
  /** 雀頭の牌種（chiitoi/kokushi は -1）。 */
  pair: number;
  wait: Wait;
}

/** 和了牌 w が順子（起点 s）のどの待ちで完成したか。 */
function shuntsuWait(s: number, w: number): Wait {
  if (w === s + 1) return "kanchan";
  if (w === s) return s % 9 === 6 ? "penchan" : "ryanmen"; // 89 待ち 7 はペンチャン
  return s % 9 === 0 ? "penchan" : "ryanmen"; // 12 待ち 3 はペンチャン
}

/** 分解に対する和了牌の所属パターンを列挙して解釈に展開する。 */
function interpsOf(decomp: Decomp, meldBlocks: Block[], w: number, tsumo: boolean): Interp[] {
  const out: Interp[] = [];
  const toBlocks = (ronShanponAt: number): Block[] => [
    ...meldBlocks,
    ...decomp.sets.map((set, k): Block => {
      const concealed = set.type === "shuntsu" ? false : k !== ronShanponAt;
      return { type: set.type, i: set.i, open: false, concealed };
    }),
  ];
  if (decomp.pair === w) {
    out.push({ form: "standard", blocks: toBlocks(-1), pair: decomp.pair, wait: "tanki" });
  }
  decomp.sets.forEach((set, k) => {
    if (set.type === "koutsu") {
      if (set.i !== w) return;
      // ロンのシャンポン完成刻子は明刻扱い（ツモは暗刻のまま）。
      out.push({
        form: "standard",
        blocks: toBlocks(tsumo ? -1 : k),
        pair: decomp.pair,
        wait: "shanpon",
      });
      return;
    }
    if (w >= set.i && w <= set.i + 2 && w < 27) {
      out.push({
        form: "standard",
        blocks: toBlocks(-1),
        pair: decomp.pair,
        wait: shuntsuWait(set.i, w),
      });
    }
  });
  return out;
}

// ------------------------------------------------------------
// 役判定
// ------------------------------------------------------------
interface Line {
  name: string;
  han: number;
}

interface Env {
  menzen: boolean;
  /** 立直（門前は検証済み）。 */
  riichi: boolean;
  tsumo: boolean;
  meldCount: number;
  /** 使用している牌種の集合（副露込み）。 */
  kinds: Set<number>;
  seatW: number;
  roundW: number;
  rules: Rules;
  /** 手全体（副露込み）の牌種ごとの枚数（ドラ数え用）。 */
  totalCounts: number[];
  dora: number;
  aka: number;
  /** 分解に依存しない役満（字一色・緑一色・清老頭・九蓮宝燈）。 */
  handYakuman: string[];
}

const GREEN_KINDS = new Set([19, 20, 21, 23, 25, 32]); // 2s3s4s6s8s發

/** 分解に依存しない（牌の集合だけで決まる）役満を列挙する。 */
function handLevelYakuman(
  kinds: Set<number>,
  counts: number[],
  menzen: boolean,
  meldCount: number,
): string[] {
  const all = [...kinds];
  const out: string[] = [];
  if (all.every((i) => i >= 27)) out.push("字一色");
  if (all.every((i) => GREEN_KINDS.has(i))) out.push("緑一色");
  if (all.every((i) => i < 27 && (i % 9 === 0 || i % 9 === 8))) out.push("清老頭");
  if (menzen && meldCount === 0 && isChuuren(counts)) out.push("九蓮宝燈");
  return out;
}

/** 九蓮宝燈（1112345678999+1枚・単色・門前14枚）か。 */
function isChuuren(c: number[]): boolean {
  for (const base of [0, 9, 18]) {
    let outside = false;
    for (let i = 0; i < 34; i++) {
      if ((i < base || i > base + 8) && c[i]! > 0) outside = true;
    }
    if (outside) continue;
    if (c[base]! >= 3 && c[base + 8]! >= 3) {
      let ok = true;
      for (let k = 1; k <= 7; k++) if (c[base + k]! < 1) ok = false;
      if (ok) return true;
    }
  }
  return false;
}

/** 標準形1解釈の役満（ブロック依存）。 */
function blockYakuman(interp: Interp): string[] {
  const out: string[] = [];
  const triplets = interp.blocks.filter((b) => b.type !== "shuntsu");
  if (triplets.length === 4 && triplets.every((b) => b.concealed)) out.push("四暗刻");
  const dragons = triplets.filter((b) => b.i >= DRAGON_BASE).length;
  if (dragons === 3) out.push("大三元");
  const winds = triplets.filter((b) => b.i >= 27 && b.i <= 30).length;
  if (winds === 4) out.push("大四喜");
  else if (winds === 3 && interp.pair >= 27 && interp.pair <= 30) out.push("小四喜");
  if (interp.blocks.filter((b) => b.type === "kan").length === 4) out.push("四槓子");
  return out;
}

/** 標準形1解釈の通常役（役満以外）。pinfu は符計算にも使うため返す。 */
function standardYaku(interp: Interp, env: Env): { lines: Line[]; pinfu: boolean } {
  const lines: Line[] = [];
  const { blocks, pair, wait } = interp;
  const { menzen, tsumo, kinds } = env;
  const kuisagari = (closedHan: number) => (menzen ? closedHan : closedHan - 1);

  const shuntsu = blocks.filter((b) => b.type === "shuntsu");
  const triplets = blocks.filter((b) => b.type !== "shuntsu");
  const pairYakuhai = pair >= DRAGON_BASE || pair === env.seatW || pair === env.roundW;

  // 同一順子のペア数（一盃口=1 / 二盃口=2。門前のみ有効）。
  let peikou = 0;
  if (menzen) {
    const byStart = new Map<number, number>();
    for (const b of shuntsu) byStart.set(b.i, (byStart.get(b.i) ?? 0) + 1);
    for (const n of byStart.values()) peikou += Math.floor(n / 2);
  }

  if (env.riichi) lines.push({ name: "立直", han: 1 });
  if (menzen && tsumo) lines.push({ name: "門前清自摸和", han: 1 });

  const pinfu =
    menzen && env.meldCount === 0 && shuntsu.length === 4 && wait === "ryanmen" && !pairYakuhai;
  if (pinfu) lines.push({ name: "平和", han: 1 });

  const allSimple = ![...kinds].some(isYaochuIdx) && !isYaochuIdx(pair);
  if (allSimple && (menzen || env.rules.kuitan)) lines.push({ name: "断幺九", han: 1 });

  if (peikou === 1) lines.push({ name: "一盃口", han: 1 });

  // 役牌（白發中・自風・場風。連風は自風+場風の2つ）
  for (const b of triplets) {
    if (b.i >= DRAGON_BASE) lines.push({ name: DRAGON_NAMES[b.i - DRAGON_BASE]!, han: 1 });
  }
  for (const b of triplets) if (b.i === env.seatW) lines.push({ name: "自風", han: 1 });
  for (const b of triplets) if (b.i === env.roundW) lines.push({ name: "場風", han: 1 });

  // 対々和・三暗刻・三槓子
  if (triplets.length === 4) lines.push({ name: "対々和", han: 2 });
  if (triplets.filter((b) => b.concealed).length === 3) lines.push({ name: "三暗刻", han: 2 });
  if (blocks.filter((b) => b.type === "kan").length === 3) lines.push({ name: "三槓子", han: 2 });

  // チャンタ族（全ブロック幺九絡み）: 順子なし=混老頭 / 字牌あり=チャンタ / 無し=純チャン
  const blockHasYaochu = (b: Block) =>
    b.type === "shuntsu" ? b.i % 9 === 0 || b.i % 9 === 6 : isYaochuIdx(b.i);
  const hasHonor = [...kinds].some((i) => i >= 27);
  if (blocks.every(blockHasYaochu) && isYaochuIdx(pair)) {
    if (shuntsu.length === 0) lines.push({ name: "混老頭", han: 2 });
    else if (hasHonor) lines.push({ name: "混全帯幺九", han: kuisagari(2) });
    else lines.push({ name: "純全帯幺九", han: kuisagari(3) });
  }

  // 小三元（大三元は役満側で先に確定している）
  const dragonTriplets = triplets.filter((b) => b.i >= DRAGON_BASE).length;
  if (dragonTriplets === 2 && pair >= DRAGON_BASE) lines.push({ name: "小三元", han: 2 });

  // 一気通貫・三色同順・三色同刻
  const runStarts = [new Set<number>(), new Set<number>(), new Set<number>()];
  for (const b of shuntsu) runStarts[Math.floor(b.i / 9)]!.add(b.i % 9);
  if (runStarts.some((s) => s.has(0) && s.has(3) && s.has(6))) {
    lines.push({ name: "一気通貫", han: kuisagari(2) });
  }
  for (let n = 0; n <= 6; n++) {
    if (runStarts.every((s) => s.has(n))) {
      lines.push({ name: "三色同順", han: kuisagari(2) });
      break;
    }
  }
  const tripletKinds = new Set(triplets.map((b) => b.i));
  for (let n = 0; n <= 8; n++) {
    if (tripletKinds.has(n) && tripletKinds.has(n + 9) && tripletKinds.has(n + 18)) {
      lines.push({ name: "三色同刻", han: 2 });
      break;
    }
  }

  // 二盃口（一盃口とは排他: ペア2組ならこちらだけ。七対子との排他は高点法が解決する）
  if (peikou >= 2) lines.push({ name: "二盃口", han: 3 });

  // 混一色 / 清一色
  const suits = new Set([...kinds].filter((i) => i < 27).map((i) => Math.floor(i / 9)));
  if (suits.size === 1) {
    if (hasHonor) lines.push({ name: "混一色", han: kuisagari(3) });
    else lines.push({ name: "清一色", han: menzen ? 6 : 5 });
  }

  return { lines, pinfu };
}

/** 七対子解釈の通常役。 */
function chiitoiYaku(env: Env): Line[] {
  const lines: Line[] = [];
  const all = [...env.kinds];
  if (env.riichi) lines.push({ name: "立直", han: 1 });
  if (env.tsumo) lines.push({ name: "門前清自摸和", han: 1 });
  if (!all.some(isYaochuIdx)) lines.push({ name: "断幺九", han: 1 });
  lines.push({ name: "七対子", han: 2 });
  if (all.every(isYaochuIdx)) lines.push({ name: "混老頭", han: 2 });
  const suits = new Set(all.filter((i) => i < 27).map((i) => Math.floor(i / 9)));
  if (suits.size === 1) {
    lines.push(all.some((i) => i >= 27) ? { name: "混一色", han: 3 } : { name: "清一色", han: 6 });
  }
  return lines;
}

// ------------------------------------------------------------
// 符計算
// ------------------------------------------------------------
function blockFu(b: Block): number {
  if (b.type === "shuntsu") return 0;
  const base = b.type === "koutsu" ? (b.concealed ? 4 : 2) : b.concealed ? 16 : 8;
  return base * (isYaochuIdx(b.i) ? 2 : 1);
}

function calcFu(interp: Interp, env: Env, pinfu: boolean): number {
  if (interp.form === "chiitoi") return 25;
  if (interp.form === "kokushi") return 0; // 役満は符不問（handScore は yakuman>0 で符を無視）
  let fu = 20;
  if (interp.wait === "kanchan" || interp.wait === "penchan" || interp.wait === "tanki") fu += 2;
  if (interp.pair >= DRAGON_BASE) fu += 2;
  if (interp.pair === env.seatW) fu += 2;
  if (interp.pair === env.roundW) fu += 2; // 連風雀頭は +4
  for (const b of interp.blocks) fu += blockFu(b);
  if (env.tsumo && !pinfu) fu += 2;
  if (!env.tsumo && env.menzen) fu += 10;
  if (!env.tsumo && !env.menzen && fu === 20) fu = 30; // 喰い平和形のロンは30符（慣例）
  return Math.ceil(fu / 10) * 10;
}

// ------------------------------------------------------------
// ドラ
// ------------------------------------------------------------
/** 表示牌の次位牌（数牌は9→1循環・風牌は東南西北循環・三元牌は白發中循環）。 */
function doraOf(indicator: Tile): number {
  const i = tileIndex(indicator);
  if (i < 27) return i % 9 === 8 ? i - 8 : i + 1;
  if (i <= 30) return i === 30 ? 27 : i + 1; // 東南西北
  return i === 33 ? 31 : i + 1; // 白發中
}

// ------------------------------------------------------------
// 本体
// ------------------------------------------------------------
export function scoreAgariHand(ctx: AgariContext, rules: Rules): AgariScoreResult | null {
  // --- 入力検証（採点不能は null） ---
  const meldBlocks: Block[] = [];
  for (const m of ctx.melds) {
    const b = meldToBlock(m);
    if (b === null) return null;
    meldBlocks.push(b);
  }
  if (ctx.closedTiles.length !== 14 - ctx.melds.length * 3) return null;
  const closedCounts = toCounts(ctx.closedTiles);
  const w = tileIndex(ctx.winTile);
  if (closedCounts[w] === 0) return null;

  // 手全体（副露込み）の枚数。同一牌5枚以上は不正。
  const totalCounts = [...closedCounts];
  for (const b of meldBlocks) {
    if (b.type === "shuntsu") {
      totalCounts[b.i]!++;
      totalCounts[b.i + 1]!++;
      totalCounts[b.i + 2]!++;
    } else {
      totalCounts[b.i]! += b.type === "kan" ? 4 : 3;
    }
  }
  if (totalCounts.some((n) => n > 4)) return null;

  const kinds = new Set<number>();
  totalCounts.forEach((n, i) => {
    if (n > 0) kinds.add(i);
  });

  const menzen = meldBlocks.every((b) => !b.open);
  // 晒しがあるのに riichi=true は矛盾した入力（暗槓のみは門前なのでリーチ可）。
  if (ctx.riichi === true && !menzen) return null;
  const dealer = ctx.seatWind === "east";

  // ドラ・赤ドラ（手牌中の枚数。赤は 0m/0p/0s の実物枚数）
  const allTiles = [...ctx.closedTiles, ...ctx.melds.flatMap((m) => m.tiles)];
  let dora = 0;
  for (const ind of ctx.doraIndicators) dora += totalCounts[doraOf(ind)]!;
  const aka = allTiles.filter((t) => t[0] === "0").length;

  const env: Env = {
    menzen,
    riichi: ctx.riichi === true,
    tsumo: ctx.tsumo,
    meldCount: ctx.melds.length,
    kinds,
    seatW: WIND_INDEX[ctx.seatWind],
    roundW: WIND_INDEX[ctx.roundWind],
    rules,
    totalCounts,
    dora,
    aka,
    handYakuman: handLevelYakuman(kinds, closedCounts, menzen, ctx.melds.length),
  };

  // --- 全解釈の列挙 ---
  const interps: Interp[] = [];
  for (const d of decomposeClosed(closedCounts)) {
    if (d.sets.length + meldBlocks.length !== 4) continue;
    interps.push(...interpsOf(d, meldBlocks, w, ctx.tsumo));
  }
  if (ctx.melds.length === 0 && ctx.closedTiles.length === 14) {
    if (closedCounts.every((n) => n === 0 || n === 2)) {
      interps.push({ form: "chiitoi", blocks: [], pair: -1, wait: "tanki" });
    }
    if (isKokushi(closedCounts)) {
      interps.push({ form: "kokushi", blocks: [], pair: -1, wait: "tanki" });
    }
  }

  // --- 各解釈を採点し高点法で選ぶ ---
  let best: AgariScoreResult | null = null;
  for (const interp of interps) {
    const r = scoreInterp(interp, env, dealer, rules);
    if (r === null) continue;
    if (
      best === null ||
      r.score.total > best.score.total ||
      (r.score.total === best.score.total && r.han > best.han) ||
      (r.score.total === best.score.total && r.han === best.han && r.fu > best.fu)
    ) {
      best = r;
    }
  }
  return best;
}

const KOKUSHI_KINDS = new Set(KOKUSHI);

function isKokushi(c: number[]): boolean {
  for (let i = 0; i < 34; i++) {
    if (!KOKUSHI_KINDS.has(i) && c[i]! > 0) return false;
  }
  return [...KOKUSHI_KINDS].every((i) => c[i]! >= 1);
}

/** 1解釈を採点する（無役は null）。 */
function scoreInterp(
  interp: Interp,
  env: Env,
  dealer: boolean,
  rules: Rules,
): AgariScoreResult | null {
  // 役満（分解非依存＋ブロック依存）。成立時は他の役・ドラを数えない。
  // ダブル役満（単騎待ち四暗刻等の倍加バリアント）は将来対応（rules.multiYakuman は
  // 「複数の役満役の複合」の倍加として handScore 側で扱う）。
  const yakumanNames = [
    ...env.handYakuman,
    ...(interp.form === "standard" ? blockYakuman(interp) : []),
    ...(interp.form === "kokushi" ? ["国士無双"] : []),
  ];

  let lines: Line[];
  let pinfu = false;
  let yakumanCount = 0;
  if (yakumanNames.length > 0) {
    lines = yakumanNames.map((name) => ({ name, han: 13 }));
    yakumanCount = lines.length;
  } else {
    if (interp.form === "kokushi") return null; // ここには来ない（安全側）
    if (interp.form === "chiitoi") {
      lines = chiitoiYaku(env);
    } else {
      const y = standardYaku(interp, env);
      lines = y.lines;
      pinfu = y.pinfu;
    }
    if (lines.length === 0) return null; // 無役（ドラのみ含む）
    if (env.dora > 0) lines.push({ name: "ドラ", han: env.dora });
    if (env.aka > 0) lines.push({ name: "赤ドラ", han: env.aka });
  }

  const han = lines.reduce((n, l) => n + l.han, 0);
  const fu = calcFu(interp, env, pinfu);
  const score = handScore({ han, fu, dealer, tsumo: env.tsumo, yakuman: yakumanCount }, rules);
  return { han, fu, yaku: lines, score };
}
