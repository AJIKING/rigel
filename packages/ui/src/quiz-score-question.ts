// ============================================================
// 点数計算クイズ v2（[決定] 2026-07-26 採点エンジン方式・Plan 3-2）
// ------------------------------------------------------------
// 手はブロック構築（面子4＋雀頭＋待ち形）で自由に組み、採点は scoreAgariHand
// （score-engine.ts: 全分解列挙×高点法・全通常役+役満・喰い下がり・ドラ/赤ドラ）へ
// 全委譲する。v1 の制約（同スート区間分離・役の種類制限・カン上限・意図しない役の棄却）は
// 撤廃し、無役（ドラのみ含む）は棄却して再抽選する。
// 清一色/牌効率の生成と共有定数・文言は quiz.ts / quiz-copy.ts（2026-07-26 に分割）。
// ============================================================

import {
  normalizeRed,
  RulesSchema,
  type MeldType,
  type QuizScoreQuestion,
  type Seat,
  type Tile,
} from "@rigel/schema";
import { meldTileViews, type MeldTileView } from "./board";
import { compareTiles } from "./edit";
import {
  NUMBER_SUITS,
  pick,
  QUIZ_MAX_GENERATION_ATTEMPTS,
  sampleUntil,
  shuffled,
} from "./quiz-random";
import { handScore, payText } from "./score";
import { scoreAgariHand } from "./score-engine";
import { CANDIDATE_TILES } from "./tile-counts";

/** 点数計算クイズのルール: 切り上げ満貫なし（[決定] 2026-07-26 オーナー指示。
 *  7700=子4翻30符ロン / 11600=親4翻30符ロン の古典的な点数を出題するため、
 *  Mリーグ既定の kiriage:true を使わない）。他の項目は既定どおり。 */
export const QUIZ_SCORE_RULES = RulesSchema.parse({ kiriage: false });

// 型は背骨（@rigel/schema QuizScoreQuestionSchema）が単一真実源（2026-08-04 移管。
// サーバのシードリプレイ再採点・有料フル保存が同じ形を使う）。フィールドの意味はそちらの
// doc コメント参照。生成器の返り値が背骨の形から逸れたら型エラーで気づける。
export type ScoreQuestion = QuizScoreQuestion;

const SEATS: readonly Seat[] = ["east", "south", "west", "north"];
const SEAT_JA: Record<Seat, string> = { east: "東", south: "南", west: "西", north: "北" };

/** 自風 → 局数（起家=あなた視点。東N局の親は N 番目の席なので、自風から局数が一意に決まる:
 *  東=1局・北=2局・西=3局・南=4局。東場/南場とも同じ対応）。条件ラベルの「東◯局」表記に使う。 */
const KYOKU_BY_SEAT: Record<Seat, number> = { east: 1, north: 2, west: 3, south: 4 };
const SCORE_WAITS = ["ryanmen", "kanchan", "penchan", "shanpon", "tanki"] as const;

/** 生成中のブロック（面子）。meld=null は門前。 */
interface GenBlock {
  type: "shuntsu" | "koutsu";
  /** shuntsu=起点牌 / koutsu=構成牌。 */
  tile: Tile;
  meld: MeldType | null;
}

/** ブロックを牌列に展開する（カンは4枚）。 */
function blockTiles(b: GenBlock): Tile[] {
  if (b.type === "shuntsu") {
    const n = Number(b.tile[0]);
    const suit = b.tile[1]!;
    return [b.tile, `${n + 1}${suit}` as Tile, `${n + 2}${suit}` as Tile];
  }
  const copies = b.meld === "kan_closed" || b.meld === "kan_open" ? 4 : 3;
  return Array.from({ length: copies }, () => b.tile);
}

/** 待ちブロック（順子）と和了牌を作る。ryanmen は両面が成立する側だけを選ぶ。 */
function buildWaitShuntsu(
  wait: "ryanmen" | "kanchan" | "penchan",
  suits: readonly ("m" | "p" | "s")[],
  rng: () => number,
): { tile: Tile; winTile: Tile } {
  const suit = pick(suits, rng);
  if (wait === "penchan") {
    // 123 の3待ち or 789 の7待ち。
    const low = rng() < 0.5;
    return { tile: `${low ? 1 : 7}${suit}` as Tile, winTile: `${low ? 3 : 7}${suit}` as Tile };
  }
  const start = 1 + Math.floor(rng() * 7);
  if (wait === "kanchan") {
    return { tile: `${start}${suit}` as Tile, winTile: `${start + 1}${suit}` as Tile };
  }
  // 両面: 残り2枚が (x,x+1)・待ちが両側とも壁の内側になる側を選ぶ。
  const options: number[] = [];
  if (start <= 6) options.push(start);
  if (start >= 2) options.push(start + 2);
  return { tile: `${start}${suit}` as Tile, winTile: `${pick(options, rng)}${suit}` as Tile };
}

/** 1回の抽選（エンジンが無役/不成立と判定したら null → 再抽選）。 */
function attemptScoreQuestion(rng: () => number): ScoreQuestion | null {
  const tsumo = rng() < 0.5;
  const seatWind = pick(SEATS, rng);
  const roundWind: "east" | "south" = rng() < 0.5 ? "east" : "south";
  // 染め寄せ: 2割で数牌を1色に絞る（混一/清一→跳満〜三倍満の出題源。分布はスキャンテストで固定）。
  const mono = rng() < 0.2 ? pick(NUMBER_SUITS, rng) : null;
  const suits = mono === null ? NUMBER_SUITS : ([mono] as const);
  const kinds =
    mono === null ? CANDIDATE_TILES : CANDIDATE_TILES.filter((t) => t[1] === mono || t[1] === "z");

  // --- 待ちブロックと完成面子・雀頭 ---
  const wait = pick(SCORE_WAITS, rng);
  const blocks: GenBlock[] = [];
  let winTile: Tile = "" as Tile; // tanki は雀頭で決まる（後で設定）
  if (wait === "ryanmen" || wait === "kanchan" || wait === "penchan") {
    const w = buildWaitShuntsu(wait, suits, rng);
    blocks.push({ type: "shuntsu", tile: w.tile, meld: null });
    winTile = w.winTile;
  } else if (wait === "shanpon") {
    const tile = pick(kinds, rng);
    blocks.push({ type: "koutsu", tile, meld: null });
    winTile = tile;
  }
  while (blocks.length < 4) {
    blocks.push(
      rng() < 0.55
        ? {
            type: "shuntsu",
            tile: `${1 + Math.floor(rng() * 7)}${pick(suits, rng)}` as Tile,
            meld: null,
          }
        : { type: "koutsu", tile: pick(kinds, rng), meld: null },
    );
  }
  const pair = pick(kinds, rng);
  if (wait === "tanki") winTile = pair;

  // --- 副露化（待ちブロック=先頭は門前に残す。tanki は全ブロックが対象） ---
  // カン0〜3組（刻子ブロックのみ。3組=三槓子も可）→ ポン/チー0〜2組。
  // 全体はカン3組のときだけ3組・それ以外は2組まで（Plan 3 の「副露0〜2組・カン0〜3組」）。
  const kanRoll = rng();
  const kanTarget = kanRoll < 0.7 ? 0 : kanRoll < 0.88 ? 1 : kanRoll < 0.96 ? 2 : 3;
  const openRoll = rng();
  const openTarget = openRoll < 0.55 ? 0 : openRoll < 0.85 ? 1 : 2;
  const first = wait === "tanki" ? 0 : 1;
  const slots = shuffled(
    Array.from({ length: 4 - first }, (_, i) => first + i),
    rng,
  );
  let kans = 0;
  for (const i of slots) {
    if (kans === kanTarget) break;
    const b = blocks[i]!;
    if (b.type === "koutsu") {
      b.meld = rng() < 0.5 ? "kan_closed" : "kan_open";
      kans++;
    }
  }
  let opens = 0;
  const openCap = Math.min(openTarget, Math.max(0, (kans >= 3 ? 3 : 2) - kans));
  for (const i of slots) {
    if (opens === openCap) break;
    const b = blocks[i]!;
    if (b.meld === null) {
      b.meld = b.type === "koutsu" ? "pon" : "chi";
      opens++;
    }
  }

  // --- リーチ: 門前（晒しなし。暗槓は門前維持）のときだけ5割で付与（[決定] 2026-07-26 追加） ---
  const menzen = blocks.every((b) => b.meld === null || b.meld === "kan_closed");
  const riichi = menzen && rng() < 0.5;

  // --- 牌列へ展開 ---
  const melds: ScoreQuestion["melds"] = [];
  const closed: Tile[] = [];
  for (const b of blocks) {
    if (b.meld === null) closed.push(...blockTiles(b));
    else {
      melds.push({
        type: b.meld,
        tiles: blockTiles(b),
        // 鳴き元は符に影響しないので表示用に rng で決める（自分以外の席。暗槓は null）。
        from:
          b.meld === "kan_closed"
            ? null
            : pick(
                SEATS.filter((s) => s !== seatWind),
                rng,
              ),
      });
    }
  }
  closed.push(pair, pair);

  // --- 赤5（rules.aka="1" 相当）: 各色1枚だけ山にある想定で、手中の5の枚数/4 の確率で1枚を赤に ---
  for (const suit of NUMBER_SUITS) {
    const five = `5${suit}` as Tile;
    const holders: { arr: Tile[]; idx: number }[] = [];
    closed.forEach((t, idx) => {
      if (t === five) holders.push({ arr: closed, idx });
    });
    for (const m of melds) {
      m.tiles.forEach((t, idx) => {
        if (t === five) holders.push({ arr: m.tiles, idx });
      });
    }
    if (holders.length > 0 && rng() * 4 < holders.length) {
      const h = holders[Math.floor(rng() * holders.length)]!;
      h.arr[h.idx] = `0${suit}` as Tile;
    }
  }
  // 和了牌が赤に置換された（通常5が門前に残っていない）場合は winTile も赤にする。
  if (!closed.includes(winTile)) winTile = `0${winTile[1]}` as Tile;

  // --- ドラ表示牌: 1枚（カン出題時は5割で2枚=新ドラ） ---
  const doraIndicators: Tile[] = [pick(CANDIDATE_TILES, rng)];
  if (kans > 0 && rng() < 0.5) doraIndicators.push(pick(CANDIDATE_TILES, rng));

  // 物理制約: 同種は表示牌込みで4枚まで（赤は5に正規化して数える）。
  const counts = new Map<Tile, number>();
  for (const t of [...closed, ...melds.flatMap((m) => m.tiles), ...doraIndicators]) {
    const key = normalizeRed(t);
    const n = (counts.get(key) ?? 0) + 1;
    if (n > 4) return null;
    counts.set(key, n);
  }

  // --- 採点はエンジンへ全委譲（無役・不成立は棄却） ---
  const result = scoreAgariHand(
    { closedTiles: closed, melds, winTile, tsumo, seatWind, roundWind, doraIndicators, riichi },
    QUIZ_SCORE_RULES,
  );
  if (result === null) return null;
  const { han, fu } = result;
  const dealer = seatWind === "east";
  const answer = payText(result.score);

  // --- 誤答3つ: 摂動（親子入替・翻±1・ツモロン入替・符±10）を rng でシャッフルし、
  // 正解・相互に重複しない文字列を先頭から採る。埋まらなければ翻を離して補う。 ---
  const payOf = (d: boolean, t: boolean, h: number, f: number) =>
    payText(handScore({ han: Math.max(1, h), fu: f, dealer: d, tsumo: t }, QUIZ_SCORE_RULES));
  const fuUp = fu === 25 ? 30 : fu + 10; // 七対子25符の摂動は10刻みへ寄せる（35符を出さない）
  const fuDown = fu === 25 ? 20 : Math.max(20, fu - 10);
  const perturbations: (() => string)[] = shuffled(
    [
      () => payOf(!dealer, tsumo, han, fu),
      () => payOf(dealer, tsumo, han + 1, fu),
      () => payOf(dealer, tsumo, han - 1, fu),
      () => payOf(dealer, !tsumo, han, fu),
      () => payOf(!dealer, !tsumo, han, fu),
      () => payOf(!dealer, tsumo, han + 1, fu),
      () => payOf(dealer, tsumo, han, fuUp),
      () => payOf(dealer, tsumo, han, fuDown),
    ],
    rng,
  );
  const seen = new Set([answer]);
  const wrongs: string[] = [];
  for (const p of perturbations) {
    if (wrongs.length === 3) break;
    const v = p();
    if (!seen.has(v)) {
      seen.add(v);
      wrongs.push(v);
    }
  }
  for (let d = 2; wrongs.length < 3 && d <= 12; d++) {
    for (const v of [payOf(dealer, tsumo, han + d, fu), payOf(dealer, tsumo, han - d, fu)]) {
      if (wrongs.length < 3 && !seen.has(v)) {
        seen.add(v);
        wrongs.push(v);
      }
    }
  }
  if (wrongs.length < 3) return null; // 理論上ほぼ起きないが、埋まらなければ再抽選

  return {
    kind: "score",
    closedTiles: closed.sort(compareTiles),
    melds,
    winTile,
    tsumo,
    riichi,
    seatWind,
    roundWind,
    doraIndicators,
    yaku: result.yaku,
    han,
    fu,
    // 条件ラベルは対局表記「東◯局 ◯家 (リーチ) ツモ/ロン」（[決定] 2026-08-04 オーナー指示で
    // 旧「親（東家）・…・場風 東」から変更。親か子かは 局と自風の表記から読み取る。
    // リーチはツモ/ロンの前に置く=既存 [決定] 2026-07-26 を踏襲）。
    label: `${SEAT_JA[roundWind]}${KYOKU_BY_SEAT[seatWind]}局 ${SEAT_JA[seatWind]}家${riichi ? " リーチ" : ""} ${tsumo ? "ツモ" : "ロン"}`,
    choices: shuffled([answer, ...wrongs], rng),
    answer,
  };
}

/**
 * 点数計算問題を1問生成する（シード決定的）。
 * 手はブロック構築で自由に組み、採点は scoreAgariHand（全分解列挙×高点法）へ全委譲する。
 * エンジンが無役（ドラのみ含む）・不成立と判定した手は棄却して再抽選する。
 */
export function generateScoreQuestion(
  rng: () => number,
  maxAttempts = QUIZ_MAX_GENERATION_ATTEMPTS,
): ScoreQuestion {
  return sampleUntil(() => attemptScoreQuestion(rng), maxAttempts);
}

/** 出題表示用: 門前部分から和了牌1枚を除いた列（和了牌は別枠で強調表示する）。 */
export function scoreDisplayTiles(q: Pick<ScoreQuestion, "closedTiles" | "winTile">): Tile[] {
  const tiles = [...q.closedTiles];
  const i = tiles.indexOf(q.winTile);
  if (i >= 0) tiles.splice(i, 1);
  return tiles;
}

/** 副露1組の表示列（盤面と同じ meldTileViews に接続。web/mobile で共用）。 */
export function scoreMeldViews(
  meld: ScoreQuestion["melds"][number],
  seatWind: Seat,
): MeldTileView[] {
  return meldTileViews(
    { type: meld.type, tiles: meld.tiles.map((tile) => ({ tile })), from: meld.from },
    seatWind,
  );
}

/** 見直しリストの役内訳1行（例「断幺九 1翻・ドラ2・計4翻30符」。役満は役名のみ+「役満」）。 */
export function scoreYakuLine(q: Pick<ScoreQuestion, "yaku" | "han" | "fu">): string {
  if (q.yaku.some((y) => y.han >= 13)) {
    return [...q.yaku.map((y) => y.name), "役満"].join("・");
  }
  const rows = q.yaku.map((y) =>
    y.name === "ドラ" || y.name === "赤ドラ" ? `${y.name}${y.han}` : `${y.name} ${y.han}翻`,
  );
  return [...rows, `計${q.han}翻${q.fu}符`].join("・");
}
