// ============================================================
// @rigel/ui — 牌譜の編集操作（プラットフォーム非依存の純粋関数）
// ------------------------------------------------------------
// web の盤面エディタ / mobile の編集画面が共有する不変更新ヘルパ。
// すべて「複製 → 変更 → KifuSchema.parse で再検証」して返す（信頼ゲート:
// 検証を通っていない牌譜を下流に流さない）。人手入力は confidence=1（確定）。
// 河の order 連番を壊さないこと（削除時は 1..n に振り直す）。
// ============================================================

import { KifuSchema, type Kifu, type Seat, type Tile } from "@rigel/schema";

function clone(k: Kifu): Kifu {
  return JSON.parse(JSON.stringify(k)) as Kifu;
}

/** 手牌に1枚追加する（確定扱い）。 */
export function addHandTile(kifu: Kifu, seat: Seat, tile: Tile): Kifu {
  const d = clone(kifu);
  d.seats[seat].hand.push({ tile, confidence: 1 });
  return KifuSchema.parse(d);
}

/** 手牌から1枚取り除く。 */
export function removeHandTile(kifu: Kifu, seat: Seat, index: number): Kifu {
  const d = clone(kifu);
  d.seats[seat].hand.splice(index, 1);
  return KifuSchema.parse(d);
}

/** 河の末尾に1枚追加する（order は連番を維持）。 */
export function addRiverTile(kifu: Kifu, seat: Seat, tile: Tile): Kifu {
  const d = clone(kifu);
  const river = d.seats[seat].river;
  river.push({ order: river.length + 1, tile, riichi: false, tsumogiri: false, confidence: 1 });
  return KifuSchema.parse(d);
}

/** 河から1枚取り除き、order を 1..n に振り直す（連番を壊さない）。 */
export function removeRiverTile(kifu: Kifu, seat: Seat, index: number): Kifu {
  const d = clone(kifu);
  const river = d.seats[seat].river;
  river.splice(index, 1);
  river.forEach((discard, i) => {
    discard.order = i + 1;
  });
  return KifuSchema.parse(d);
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
  return KifuSchema.parse(d);
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

/** 鳴きを追加する（kan は明槓=kan_open。from は不明のため null）。 */
export function addMeld(kifu: Kifu, seat: Seat, type: MeldPick, tile: Tile): Kifu {
  const d = clone(kifu);
  d.seats[seat].melds.push({
    type: type === "kan" ? "kan_open" : type,
    tiles: meldTiles(type, tile).map((t) => ({ tile: t, confidence: 1 })),
    from: null,
  });
  return KifuSchema.parse(d);
}

/** 鳴きを丸ごと取り除く。 */
export function removeMeld(kifu: Kifu, seat: Seat, meldIndex: number): Kifu {
  const d = clone(kifu);
  d.seats[seat].melds.splice(meldIndex, 1);
  return KifuSchema.parse(d);
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
