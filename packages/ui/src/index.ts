// ============================================================
// @rigel/ui — 牌・盤面の表示ロジック（プラットフォーム非依存の純粋関数）
// ------------------------------------------------------------
// 描画コンポーネント本体は各アプリ側（web=Next.js / mobile=RN）に置く。
// UI共有手段は [未確定]（Tamagui / RN Web / 自前SVG）なので、ここでは
// 「どう見せるか」の純粋ロジックだけを共有する。
// ============================================================

import {
  KifuSchema,
  type CameraSeat,
  type Kifu,
  type ReadTile,
  type Seat,
  type Tile,
} from "@rigel/schema";

// 打点計算（han/fu + ルール → 支払い）。
export * from "./score";
// 役カタログ（点数計算の入力補助）。
export * from "./yaku";
// 局跨ぎの点棒集計（持ち点・成績）。
export * from "./standings";
// 手順（タイムライン）の導出・巡目・盤面同期。
export * from "./timeline";
// 盤面表示の共有ヘルパ（自風・局名・河の巡送り）。
export * from "./board";
// 牌譜の編集操作（追加/削除/フラグ/鳴き）とピッカー素材。
export * from "./edit";
// ルール設定フォームの共有定義（web RulesDialog / mobile RulesSheet 共用）。
export * from "./rules-form";

const SEAT_ORDER: Seat[] = ["east", "south", "west", "north"];

/** confidence がこの値未満なら UI で「要確認」ハイライトにする閾値（暫定。eval で調整する）。 */
export const REVIEW_CONFIDENCE_THRESHOLD = 0.8;

/**
 * 牌が人手確認を要するか。
 * 読めなかった牌(null) か、確信度が閾値未満なら true。
 * 「自信満々の誤読」を人に拾わせる入口なので、迷ったら確認側に倒す。
 */
export function needsReview(tile: ReadTile, threshold = REVIEW_CONFIDENCE_THRESHOLD): boolean {
  return tile.tile === null || tile.confidence < threshold;
}

export type Suit = "m" | "p" | "s" | "z";

export interface TileInfo {
  suit: Suit;
  /** 数牌は 1..9、字牌は 1..7（東南西北白發中）。赤ドラ(0m/0p/0s)は rank=5。 */
  rank: number;
  red: boolean;
}

/** 天鳳式の牌コードを描画しやすい形に分解する。null は null。 */
export function describeTile(tile: Tile | null): TileInfo | null {
  if (tile === null) return null;
  const n = Number(tile[0]);
  const suit = tile[1] as Suit;
  const red = n === 0;
  return { suit, rank: red ? 5 : n, red };
}

const SUIT_MARK: Record<Suit, string> = { m: "萬", p: "筒", s: "索", z: "字" };
const HONOR_LABELS = ["東", "南", "西", "北", "白", "發", "中"]; // 1z..7z

/** 牌の人間向けラベル（例: "1m"→"1萬", "0p"→"赤5筒", "1z"→"東", null→"?"）。 */
export function tileLabel(tile: Tile | null): string {
  const info = describeTile(tile);
  if (!info) return "?";
  if (info.suit === "z") return HONOR_LABELS[info.rank - 1] ?? "?";
  return `${info.red ? "赤" : ""}${info.rank}${SUIT_MARK[info.suit]}`;
}

const SEAT_LABELS: Record<Seat, string> = { east: "東", south: "南", west: "西", north: "北" };

/** 席の日本語ラベル。 */
export function seatLabel(seat: Seat): string {
  return SEAT_LABELS[seat];
}

const CAMERA_LABELS: Record<CameraSeat, string> = {
  bottom: "手前",
  right: "右",
  top: "向かい",
  left: "左",
};

/** カメラ相対位置の日本語ラベル（撮影UIで使う）。 */
export function cameraLabel(cam: CameraSeat): string {
  return CAMERA_LABELS[cam];
}

/** /analyze の HTTP ステータスを日本語メッセージに（撮影フロー共通）。 */
export function analyzeErrorMessage(status: number, reason?: string): string {
  switch (status) {
    case 401:
      return "ログインが必要です。";
    case 402:
      return "今月の無料枠を使い切りました。";
    case 404:
      return "指定した半荘が見つかりません。";
    case 502:
      return "解析に失敗しました。少し待って再度お試しください。";
    default:
      return reason ?? "保存に失敗しました。";
  }
}

/** 課金 Checkout 開始に失敗したときの日本語メッセージ（web/mobile 共通）。
 *  501=未設定、409=加入中（変更・解約は決済ポータルで行う）。 */
export function checkoutErrorMessage(status: number): string {
  if (status === 501) return "課金は準備中です。";
  if (status === 409) return "プランの変更・解約は決済ポータルから行えます。";
  return "開始できませんでした。";
}

// ------------------------------------------------------------
// プラン表示（free / RIGEL Next / RIGEL Pro）
// ------------------------------------------------------------
export type Plan = "free" | "next" | "pro";
export type PaidPlan = "next" | "pro";

const PLAN_LABELS: Record<Plan, string> = { free: "Free", next: "Next", pro: "Pro" };
const PLAN_MONTHLY_PRICE: Record<Plan, number> = { free: 0, next: 480, pro: 1480 };

// 牌譜(局)の保存上限。api 側 PRIVATE_KIFU_LIMIT / DRAFT_LIMIT と一致させる（null=無制限）。
const PRIVATE_KIFU_LIMIT: Record<Plan, number | null> = { free: 5, next: null, pro: null };
const DRAFT_KIFU_LIMIT: Record<Plan, number | null> = { free: 5, next: null, pro: null };

/** プランごとの牌譜(局)保存上限。非公開(complete)と下書きは別枠。null=無制限。 */
export function planKifuLimits(plan: Plan): { private: number | null; draft: number | null } {
  return { private: PRIVATE_KIFU_LIMIT[plan], draft: DRAFT_KIFU_LIMIT[plan] };
}

/** プランの表示名。 */
export function planLabel(plan: Plan): string {
  return PLAN_LABELS[plan];
}

/** プランの月額（円）。 */
export function planMonthlyPrice(plan: Plan): number {
  return PLAN_MONTHLY_PRICE[plan];
}

/** App Store 決済の手数料率（Apple の 30%）。IAP 経由の販売価格に上乗せする。 */
export const APP_STORE_FEE_RATE = 0.3;

/** App Store（アプリ内課金）経由の月額（円）。手数料ぶん 30% 割増した価格。 */
export function planMonthlyPriceAppStore(plan: Plan): number {
  return Math.round(PLAN_MONTHLY_PRICE[plan] * (1 + APP_STORE_FEE_RATE));
}

/** いまのプランからアップグレード可能な有料プラン（上位のみ）。 */
export function upgradeTargets(plan: Plan): PaidPlan[] {
  if (plan === "pro") return [];
  if (plan === "next") return ["pro"];
  return ["next", "pro"];
}

/** 公開範囲の表示名。 */
export function visibilityLabel(visibility: "public" | "private"): string {
  return visibility === "public" ? "公開" : "非公開";
}

/**
 * 公開カード/ビューアの著者表記。handle があれば `@handle`、無ければ表示名、
 * どちらも無ければ（プロフィール非公開など）`fallback`（既定「名無し」）。
 * web/mobile の公開一覧・ビューアで表記を統一する。
 */
export function authorLabel(
  author: { handle?: string | null; name?: string | null },
  fallback = "名無し",
): string {
  if (author.handle) return `@${author.handle}`;
  return author.name || fallback;
}

// ============================================================
// 描画用の「面仕様」（プラットフォーム非依存）
// ------------------------------------------------------------
// 牌の見た目は「SVG自前・簡易フェイス」方式。web=<svg> / mobile=react-native-svg が
// この tileFace() の戻り値だけを見て描く（描画コードは各アプリ）。
// 詳細: docs/開発ガイド/06_牌のデザイン.md
// ============================================================

/** スートの基準字色（数牌）。赤ドラは RED_TILE_COLOR を優先。 */
export const SUIT_COLOR: Record<Suit, string> = {
  m: "#9b1c1c", // 萬子=赤茶
  p: "#0b5cad", // 筒子=青
  s: "#1b7a2f", // 索子=緑
  z: "#222222", // 字牌=黒
};
export const RED_TILE_COLOR = "#e60026";
/** 要確認（confidence 低 / 読み取り失敗）の強調色。 */
export const REVIEW_COLOR = "#d10f3a";

export type TileKind = "number" | "honor" | "unknown";

export interface TileFace {
  kind: TileKind;
  /** 数牌は 1..9（赤は5）。字牌/不明は undefined。 */
  rank?: number;
  suit?: Suit;
  red: boolean;
  /** メイン表示文字。数牌=スート記号(萬/筒/索)、字牌=東..中、不明=?。 */
  glyph: string;
  /** 字色。 */
  color: string;
}

/** 牌コードを描画用の面仕様へ変換する。各プラットフォームはこの仕様だけ見て描く。 */
export function tileFace(tile: Tile | null): TileFace {
  const info = describeTile(tile);
  if (!info) {
    return { kind: "unknown", red: false, glyph: "?", color: "#aaaaaa" };
  }
  if (info.suit === "z") {
    return {
      kind: "honor",
      rank: info.rank,
      red: false,
      glyph: HONOR_LABELS[info.rank - 1] ?? "?",
      color: SUIT_COLOR.z,
    };
  }
  return {
    kind: "number",
    rank: info.rank,
    suit: info.suit,
    red: info.red,
    glyph: SUIT_MARK[info.suit],
    color: info.red ? RED_TILE_COLOR : SUIT_COLOR[info.suit],
  };
}

// ------------------------------------------------------------
// OSS 牌画像（FluffyStuff/riichi-mahjong-tiles, CC0）のファイル名マッピング
//   牌コード → アセットのベース名（web=public/tiles/<name>.svg, mobile=assets/tiles/<name>.png）。
//   各プラットフォームは Front + このシンボルを重ねて1牌を描く。
// ------------------------------------------------------------
const SUIT_ASSET: Record<"m" | "p" | "s", string> = { m: "Man", p: "Pin", s: "Sou" };
const HONOR_ASSET = ["Ton", "Nan", "Shaa", "Pei", "Haku", "Hatsu", "Chun"]; // 1z..7z

/** 牌コードを OSS アセットのベース名へ。例: "1m"→"Man1", "0p"→"Pin5-Dora", "1z"→"Ton"。 */
export function tileAssetName(tile: Tile): string {
  const info = describeTile(tile);
  if (!info) return "Blank";
  if (info.suit === "z") return HONOR_ASSET[info.rank - 1] ?? "Blank";
  const prefix = SUIT_ASSET[info.suit];
  return info.red ? `${prefix}5-Dora` : `${prefix}${info.rank}`;
}

// ============================================================
// 牌譜の確認・修正ロジック（純貋・共有）
// ------------------------------------------------------------
// 「確信度の低い箇所を人が直す」ワークフローの中核。どの牌が要確認か（collectReviewItems）と、
// 修正の不変更新（applyTileEdit）を純粋関数で提供し、各プラットフォームの編集UIが使う。
// ============================================================

export type TileArea = "hand" | "river" | "meld";

export interface TileLocation {
  seat: Seat;
  area: TileArea;
  /** hand/river 内、または meld.tiles 内のインデックス。 */
  index: number;
  /** area==="meld" のときの鳴きインデックス。 */
  meldIndex?: number;
}

export interface ReviewItem {
  location: TileLocation;
  read: ReadTile;
}

/** 牌譜の中で「要確認」な牌（confidence 低 / 読めなかった）を席順に集める。 */
export function collectReviewItems(kifu: Kifu): ReviewItem[] {
  const items: ReviewItem[] = [];
  for (const seat of SEAT_ORDER) {
    const board = kifu.seats[seat];
    board.hand.forEach((read, index) => {
      if (needsReview(read)) items.push({ location: { seat, area: "hand", index }, read });
    });
    board.melds.forEach((meld, meldIndex) => {
      meld.tiles.forEach((read, index) => {
        if (needsReview(read)) {
          items.push({ location: { seat, area: "meld", index, meldIndex }, read });
        }
      });
    });
    board.river.forEach((discard, index) => {
      if (needsReview(discard)) {
        items.push({ location: { seat, area: "river", index }, read: discard });
      }
    });
  }
  return items;
}

/**
 * 1牌を修正した新しい牌譜を返す（不変）。
 * 人が直したので confidence は 1（確定）にする。結果は KifuSchema で再検証する。
 */
export function applyTileEdit(kifu: Kifu, loc: TileLocation, tile: Tile | null): Kifu {
  const draft = JSON.parse(JSON.stringify(kifu)) as Kifu;
  const board = draft.seats[loc.seat];
  const target: ReadTile | undefined =
    loc.area === "hand"
      ? board.hand[loc.index]
      : loc.area === "river"
        ? board.river[loc.index]
        : board.melds[loc.meldIndex ?? 0]?.tiles[loc.index];
  if (target) {
    target.tile = tile;
    target.confidence = 1;
  }
  return KifuSchema.parse(draft);
}
