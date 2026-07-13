// ============================================================
// @rigel/ui — 牌譜の編集操作（プラットフォーム非依存の純粋関数）
// ------------------------------------------------------------
// web の盤面エディタ / mobile の編集画面が共有する不変更新ヘルパ。
// すべて「複製 → 変更 → KifuSchema.parse で再検証」して返す（信頼ゲート:
// 検証を通っていない牌譜を下流に流さない）。人手入力は confidence=1（確定）。
// 河の order 連番を壊さないこと（削除時は 1..n に振り直す）。
// ============================================================

import {
  AgariSchema,
  KifuSchema,
  type Agari,
  type Kifu,
  type Seat,
  type Tile,
} from "@rigel/schema";
import { SEAT_ORDER } from "./board";
import { reconcileTimeline } from "./timeline";

/**
 * 盤面(seats)を編集した後の共通後処理。timeline が非空なら「打牌＝東南西北×巡目順」に
 * 正規化して同期する（盤面編集が手順ナビに反映されない/消える問題の防止）。空なら何もしない
 * （deriveTimeline が seats から巡目順に導出するため）。
 */
function syncBoardEdit(kifu: Kifu): Kifu {
  return kifu.timeline.length > 0 ? reconcileTimeline(kifu) : kifu;
}

function clone(k: Kifu): Kifu {
  return JSON.parse(JSON.stringify(k)) as Kifu;
}

/**
 * 汎用の不変更新ヘルパ（複製 → 変更 → Zod 再検証）。web/mobile エディタの
 * mutate はこれを使う。スキーマ違反になる変更は例外＝検証を通らない牌譜を返さない。
 */
export function mutateKifu(kifu: Kifu, fn: (draft: Kifu) => void): Kifu {
  const d = clone(kifu);
  fn(d);
  return KifuSchema.parse(d);
}

// ------------------------------------------------------------
// 結果（なし/和了/流局）モード。web/mobile の編集画面が同じ導出・切替を使う。
// result(ron/tsumo) は和了者ごとの from から導出する（単一の真実源は agari 配列）。
// ------------------------------------------------------------

export type ResultMode = "none" | "win" | "draw";

/** 現在の結果モード。draw が最優先、和了があれば win、どちらも無ければ none。 */
export function resultModeOf(kifu: Kifu): ResultMode {
  return kifu.result === "draw" ? "draw" : kifu.agari.length > 0 ? "win" : "none";
}

/** 和了配列から result(ロン/ツモ) を導出（放銃者ありが1件でもあればロン、無ければツモ）。 */
export function deriveWinResult(agari: Agari[]): "ron" | "tsumo" | null {
  if (agari.length === 0) return null;
  return agari.some((a) => a.from !== null) ? "ron" : "tsumo";
}

/** 結果モードの切替を適用した新しい Kifu を返す。
 *  和了: 既存が無ければツモ和了1件を作る / 流局: 和了を消し聴牌入力へ / なし: 全消し。 */
export function applyResultMode(kifu: Kifu, mode: ResultMode, dealer: Seat): Kifu {
  return mutateKifu(kifu, (d) => {
    if (mode === "none") {
      d.result = null;
      d.agari = [];
      d.tenpai = [];
    } else if (mode === "draw") {
      d.result = "draw";
      d.agari = [];
    } else {
      if (d.agari.length === 0) d.agari = [AgariSchema.parse({ winner: dealer, from: null })];
      d.result = deriveWinResult(d.agari);
      d.tenpai = [];
    }
  });
}

// ------------------------------------------------------------
// ドラ/裏ドラ（複数枚＝カンで増える。最大5）。web/mobile のエディタが共有する。
// ------------------------------------------------------------

export type DoraKind = "dora" | "uraDora";

/** ドラ表示牌を追加（index 省略時）または index の1枚を差し替える。
 *  最大5枚（スキーマ検証）を超える追加は例外＝呼び出し側で length<5 をガードする。 */
export function setDoraTile(kifu: Kifu, kind: DoraKind, tile: Tile, index?: number): Kifu {
  return mutateKifu(kifu, (d) => {
    if (index === undefined) d.meta[kind].push(tile);
    else d.meta[kind][index] = tile;
  });
}

/** ドラ表示牌を1枚取り除く。 */
export function removeDoraTile(kifu: Kifu, kind: DoraKind, index: number): Kifu {
  return mutateKifu(kifu, (d) => {
    d.meta[kind].splice(index, 1);
  });
}

// ------------------------------------------------------------
// 理牌（手牌・配牌の並び順）。萬1-9 → 筒1-9 → 索1-9 → 東南西北白發中。
// 手牌には order が無いので並べ替えだけでよい（河は order 時系列なので対象外）。
// ------------------------------------------------------------

const SUIT_SORT_ORDER: Record<string, number> = { m: 0, p: 1, s: 2, z: 3 };

/** 理牌用の比較関数。赤5(0x)は同スートの5の直後、読めなかった牌(null)は末尾。 */
export function compareTiles(a: Tile | null, b: Tile | null): number {
  if (a === null || b === null) return (a === null ? 1 : 0) - (b === null ? 1 : 0);
  const bySuit = (SUIT_SORT_ORDER[a[1]] ?? 9) - (SUIT_SORT_ORDER[b[1]] ?? 9);
  if (bySuit !== 0) return bySuit;
  const rank = (t: Tile) => (t[0] === "0" ? 5.5 : Number(t[0]));
  return rank(a) - rank(b);
}

/** 手牌を理牌した新しい配列を返す（安定ソート＝confidence 等は牌ごとに保持、元は不変）。 */
export function sortHandTiles<T extends { tile: Tile | null }>(hand: readonly T[]): T[] {
  return [...hand].sort((x, y) => compareTiles(x.tile, y.tile));
}

/** 全席の手牌を理牌した新しい Kifu を返す（河・鳴きは変えない）。
 *  エディタが牌譜を読み込むときの正規化に使う（表示順＝データ順を保ち index 編集を壊さない）。 */
export function sortKifuHands(kifu: Kifu): Kifu {
  return mutateKifu(kifu, (d) => {
    for (const seat of SEAT_ORDER) {
      d.seats[seat].hand = sortHandTiles(d.seats[seat].hand);
    }
  });
}

/** 手牌に1枚追加する（確定扱い）。追加のたびに理牌する。 */
export function addHandTile(kifu: Kifu, seat: Seat, tile: Tile): Kifu {
  const d = clone(kifu);
  d.seats[seat].hand.push({ tile, confidence: 1 });
  d.seats[seat].hand = sortHandTiles(d.seats[seat].hand);
  return KifuSchema.parse(d);
}

/** 手牌から1枚取り除く。 */
export function removeHandTile(kifu: Kifu, seat: Seat, index: number): Kifu {
  const d = clone(kifu);
  d.seats[seat].hand.splice(index, 1);
  return KifuSchema.parse(d);
}

/** 河の末尾に1枚追加する（order は連番を維持）。捨て方(リーチ/ツモ切り)は任意。 */
export function addRiverTile(
  kifu: Kifu,
  seat: Seat,
  tile: Tile,
  flags: { riichi?: boolean; tsumogiri?: boolean } = {},
): Kifu {
  const d = clone(kifu);
  const river = d.seats[seat].river;
  river.push({
    order: river.length + 1,
    tile,
    riichi: flags.riichi ?? false,
    tsumogiri: flags.tsumogiri ?? false,
    calledBy: null,
    confidence: 1,
  });
  return syncBoardEdit(KifuSchema.parse(d));
}

/** 河から1枚取り除き、order を 1..n に振り直す（連番を壊さない）。 */
export function removeRiverTile(kifu: Kifu, seat: Seat, index: number): Kifu {
  const d = clone(kifu);
  const river = d.seats[seat].river;
  river.splice(index, 1);
  river.forEach((discard, i) => {
    discard.order = i + 1;
  });
  return syncBoardEdit(KifuSchema.parse(d));
}

/** 捨牌のリーチ宣言（横向き）/ ツモ切りフラグを切り替える（指定した項目だけ）。 */
export function setDiscardFlags(
  kifu: Kifu,
  seat: Seat,
  index: number,
  flags: { riichi?: boolean; tsumogiri?: boolean },
): Kifu {
  const d = clone(kifu);
  const discard = d.seats[seat].river[index];
  if (discard) {
    if (flags.riichi !== undefined) discard.riichi = flags.riichi;
    if (flags.tsumogiri !== undefined) discard.tsumogiri = flags.tsumogiri;
  }
  return syncBoardEdit(KifuSchema.parse(d));
}

/** 鳴かれた捨て牌の印（誰が鳴いたか。null=解除）。timeline 非空なら手順にも同期する。 */
export function setDiscardCalledBy(
  kifu: Kifu,
  seat: Seat,
  index: number,
  calledBy: Seat | null,
): Kifu {
  const d = clone(kifu);
  const discard = d.seats[seat].river[index];
  if (discard) discard.calledBy = calledBy;
  return syncBoardEdit(KifuSchema.parse(d));
}

/** 自席以外の3席を下家順で返す（鳴き先の候補。ピッカーの選択肢と順送りで共用）。 */
export function otherSeats(self: Seat): Seat[] {
  return [1, 2, 3].map((k) => SEAT_ORDER[(SEAT_ORDER.indexOf(self) + k) % 4]!);
}

/** 「鳴き先」の順送り（なし→下家→対面→上家→なし。自席は出ない）。
 *  web の手順タブ・mobile の編集チップで共用する。 */
export function cycleCalledBy(cur: Seat | null, self: Seat): Seat | null {
  const others = otherSeats(self);
  if (cur === null) return others[0]!;
  const i = others.indexOf(cur);
  return i < 0 || i === others.length - 1 ? null : others[i + 1]!;
}

/** ピッカー向けの鳴き種別（スキーマの kan_open/closed/added は web 側で選ぶ。既定は明槓）。 */
export type MeldPick = "chi" | "pon" | "kan";

/** 鳴き牌の並びを作る。ポン=同牌3枚、カン=同牌4枚、チー=選択牌を含む3連続（両端は1-9に収める）。
 *  字牌など連続を作れない牌でチーが指定された場合は同種3枚にフォールバックする。 */
export function meldTiles(type: MeldPick, code: Tile): Tile[] {
  if (type === "pon") return [code, code, code];
  if (type === "kan") return [code, code, code, code];
  const su = code[1];
  if (su !== "m" && su !== "p" && su !== "s") return [code, code, code];
  const n = code[0] === "0" ? 5 : Number(code[0]);
  const st = Math.max(1, Math.min(n - 1, 7));
  return [`${st}${su}` as Tile, `${st + 1}${su}` as Tile, `${st + 2}${su}` as Tile];
}

/** addMeld が受け付ける鳴き種別。"kan" は明槓(kan_open)の別名。カンは種別を明示指定できる。 */
export type MeldAddType = MeldPick | "kan_open" | "kan_closed" | "kan_added";

/** 保存する MeldType（"kan" 別名は kan_open に正規化）。 */
function storedMeldType(
  type: MeldAddType,
): "chi" | "pon" | "kan_open" | "kan_closed" | "kan_added" {
  return type === "kan" ? "kan_open" : type;
}
/** 牌の並びを決める種別（カン系はすべて4枚＝"kan" 扱い）。 */
function tileShape(type: MeldAddType): MeldPick {
  return type === "chi" ? "chi" : type === "pon" ? "pon" : "kan";
}

/** 鳴きで手牌から出る枚数（残りは他家の捨て牌/既存の鳴き）。ポン/チー=2、大明槓=3、
 *  暗槓=4、加槓=1（既存ポンに1枚足す）。手牌＋鳴きが増えすぎないよう手牌を減らす。 */
function handTilesUsed(type: MeldAddType): number {
  const t = storedMeldType(type);
  if (t === "kan_closed") return 4;
  if (t === "kan_open") return 3;
  if (t === "kan_added") return 1;
  return 2; // chi / pon
}

/** 鳴きを追加する（from は盤面編集では不明のため null。カンは種別を指定可）。
 *  鳴いた枚数ぶん手牌を末尾から減らす（手牌＋鳴きの合計が増えすぎないように）。 */
export function addMeld(kifu: Kifu, seat: Seat, type: MeldAddType, tile: Tile): Kifu {
  const d = clone(kifu);
  d.seats[seat].melds.push({
    type: storedMeldType(type),
    tiles: meldTiles(tileShape(type), tile).map((t) => ({ tile: t, confidence: 1 })),
    from: null,
  });
  const hand = d.seats[seat].hand;
  hand.splice(Math.max(0, hand.length - handTilesUsed(type))); // 末尾から鳴いた枚数を除く
  // 新しい鳴きは timeline で「末尾（最新）」に入る（reconcile がアンカー無し=末尾として扱う）。
  return syncBoardEdit(KifuSchema.parse(d));
}

/** 鳴きを丸ごと取り除く。timeline 非空なら対応する鳴きイベントも除去（アンカー整列を維持）。 */
export function removeMeld(kifu: Kifu, seat: Seat, meldIndex: number): Kifu {
  const d = clone(kifu);
  d.seats[seat].melds.splice(meldIndex, 1);
  if (d.timeline.length > 0) {
    let seen = -1;
    d.timeline = d.timeline.filter((e) => {
      if (e.kind === "meld" && e.seat === seat) return ++seen !== meldIndex;
      return true;
    });
  }
  return syncBoardEdit(KifuSchema.parse(d));
}

// ------------------------------------------------------------
// 牌ピッカーの素材（スート一覧・選択候補）。web/mobile のピッカーUIで共用する。
// ------------------------------------------------------------

export type PickerSuit = "m" | "p" | "s" | "z";
export const SUITS: { suit: PickerSuit; label: string }[] = [
  { suit: "m", label: "萬" },
  { suit: "p", label: "筒" },
  { suit: "s", label: "索" },
  { suit: "z", label: "字" },
];
/** 牌種ごとの選択候補（末尾の 0x は赤ドラ）。 */
export const NUMS: Record<PickerSuit, Tile[]> = {
  m: ["1m", "2m", "3m", "4m", "5m", "6m", "7m", "8m", "9m", "0m"],
  p: ["1p", "2p", "3p", "4p", "5p", "6p", "7p", "8p", "9p", "0p"],
  s: ["1s", "2s", "3s", "4s", "5s", "6s", "7s", "8s", "9s", "0s"],
  z: ["1z", "2z", "3z", "4z", "5z", "6z", "7z"],
};
