// ============================================================
// @rigel/ui — 牌・盤面の表示ロジック（プラットフォーム非依存の純粋関数）
// ------------------------------------------------------------
// 描画コンポーネント本体は各アプリ側（web=Next.js / mobile=RN）に置く。
// UI共有手段は [未確定]（Tamagui / RN Web / 自前SVG）なので、ここでは
// 「どう見せるか」の純粋ロジックだけを共有する。
// ============================================================

import {
  KifuSchema,
  ProblemSchema,
  SCHEMA_VERSION,
  TileSchema,
  PROBLEM_SCHEMA_VERSION,
  type CallType,
  type CameraSeat,
  type Kifu,
  type Meld,
  type Problem,
  type ProblemAction,
  type ProblemKind,
  type ReadTile,
  type Rules,
  type Seat,
  type Tile,
} from "@rigel/schema";
import { meldTiles, sortHandTiles, type MeldPick } from "./edit";

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

/** /analyze の HTTP ステータスを日本語メッセージに（撮影フロー共通）。
 *  reason は API が返す文字列。人向けの説明文（日本語・記号入り）はそのまま出すが、
 *  機械コード（英小文字と _ のみ、例: user_not_found）はユーザーに見せず一般文言にする。 */
export function analyzeErrorMessage(status: number, reason?: string): string {
  switch (status) {
    case 401:
      return "ログインが必要です。";
    case 402:
      return "今月の解析回数の上限に達しました。プランのアップグレードで増やせます。";
    case 404:
      return "指定した半荘が見つかりません。";
    case 502:
      return "解析に失敗しました。少し待って再度お試しください。";
    default:
      return reason && !/^[a-z_]+$/.test(reason) ? reason : "解析に失敗しました。";
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

// 牌譜の保存上限（半荘単位）。api 側 PRIVATE_KIFU_LIMIT / DRAFT_LIMIT と一致させる（null=無制限）。
const PRIVATE_KIFU_LIMIT: Record<Plan, number | null> = { free: 5, next: null, pro: null };
const DRAFT_KIFU_LIMIT: Record<Plan, number | null> = { free: 5, next: null, pro: null };

/** 何切る問題の保存上限（draft+published 合算）。api 側 PROBLEM_LIMIT と一致させる（null=無制限）。 */
export const PROBLEM_LIMIT: Record<Plan, number | null> = { free: 20, next: null, pro: null };

/** プランごとの保存上限（半荘数）。非公開(complete)と下書きは別枠。null=無制限。 */
export function planKifuLimits(plan: Plan): { private: number | null; draft: number | null } {
  return { private: PRIVATE_KIFU_LIMIT[plan], draft: DRAFT_KIFU_LIMIT[plan] };
}

/** 1半荘あたりの局数上限。api 側 MAX_LOGS_PER_GAME と一致させる。 */
export const MAX_LOGS_PER_GAME = 30;

/** 局順(seq)の上限（東一局=1〜北四局=16）。api 側 MAX_SEQ と一致させる。 */
export const MAX_SEQ = 16;

/** 保存上限エラーの共通文言（半荘単位）。web/mobile で同じ文言を出す（表記ゆれ防止）。 */
export const LIMIT_MESSAGES = {
  /** 403: 非公開(complete)の半荘が無料上限。 */
  privateGames: `非公開の半荘は${PRIVATE_KIFU_LIMIT.free}つまでです（有料プランで無制限）。`,
  /** 403: 下書きを含む半荘が無料上限。 */
  draftGames: `無料プランの下書き半荘は${DRAFT_KIFU_LIMIT.free}つまでです（有料プランで無制限）。`,
  /** 409: 1半荘の局数上限。 */
  gameFull: `1半荘は${MAX_LOGS_PER_GAME}局までです。`,
  /** 403: 何切る問題が無料上限。 */
  problems: `無料プランの何切る問題は${PROBLEM_LIMIT.free}問までです（有料プランで無制限）。`,
} as const;

/** プランの表示名。 */
export function planLabel(plan: Plan): string {
  return PLAN_LABELS[plan];
}

/** プランごとの提供内容（料金プラン UI の説明。web のプランカード / mobile のプランシートで共用）。 */
export const PLAN_FEATURES: Record<Plan, readonly string[]> = {
  free: [
    "公開牌譜の保存 無制限",
    "非公開の半荘 5つまで",
    "下書きの半荘 5つまで",
    "写真からのAI再現 なし",
  ],
  next: ["Free の全機能", "非公開・下書きの保存 無制限", "写真からのAI再現 月100回相当"],
  pro: ["Next の全機能", "写真からのAI再現 月320回相当"],
};

/** プランの月額（円）。 */
export function planMonthlyPrice(plan: Plan): number {
  return PLAN_MONTHLY_PRICE[plan];
}

// 月間の AI 解析（Gemini 呼び出し）枠。api 側 MONTHLY_CALL_QUOTA と一致させる。
const PLAN_MONTHLY_AI_QUOTA: Record<Plan, number> = { free: 0, next: 100, pro: 320 };

/** プランの月間 AI 解析枠（呼び出し回数）。free は 0 = 写真からの再現は使えない。 */
export function planMonthlyAiQuota(plan: Plan): number {
  return PLAN_MONTHLY_AI_QUOTA[plan];
}

/** 写真からのAI再現を使えるプランか（解析枠が1以上）。撮影UIの出し分けに使う。 */
export function planCanAnalyze(plan: Plan): boolean {
  return PLAN_MONTHLY_AI_QUOTA[plan] > 0;
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

// ============================================================
// 何切る問題（表示・回答の共有ロジック。web/mobile で共用）
// ============================================================

/**
 * 問題の盤面を牌譜(Kifu)へ写す（BoardTable 等の描画部品を再利用するため）。
 * pov を手前(cameraBottomSeat)に置き、視点の手牌は理牌する。
 * capturedAt は描画専用の固定値（問題に撮影時刻は無い）。
 */
export function problemToKifu(problem: Problem): Kifu {
  const seats = Object.fromEntries(
    SEAT_ORDER.map((seat) => {
      const board = problem.seats[seat];
      return [
        seat,
        { ...board, hand: seat === problem.pov ? sortHandTiles(board.hand) : board.hand },
      ];
    }),
  );
  return KifuSchema.parse({
    schemaVersion: SCHEMA_VERSION,
    capturedAt: "2026-01-01T00:00:00.000Z",
    cameraBottomSeat: problem.pov,
    seats,
    meta: {
      dealer: problem.meta.dealer,
      roundWind: problem.meta.roundWind,
      honba: problem.meta.honba,
      kyotaku: problem.meta.kyotaku,
      junme: problem.meta.junme,
      dora: problem.meta.dora,
      note: problem.meta.note,
    },
    rules: problem.rules,
  });
}

const CALL_LABELS: Record<CallType, string> = { pon: "ポン", chi: "チー", kan: "カン" };

/** 出題形式の表示名（一覧カード・編集画面で共用）。 */
export const PROBLEM_KIND_LABELS: Record<ProblemKind, string> = {
  discard: "何切る",
  call: "鳴き判断",
};

/** 鳴き判断の選択式（スルー/ポン/チー/カン）。UI の並び順ごと共有する。 */
export const CALL_CHOICES: readonly { key: "pass" | CallType; label: string }[] = [
  { key: "pass", label: "スルー" },
  { key: "pon", label: CALL_LABELS.pon },
  { key: "chi", label: CALL_LABELS.chi },
  { key: "kan", label: CALL_LABELS.kan },
];

/** 回答UIの選択状態（web/mobile の回答・編集画面が共有する形）。 */
export interface ProblemAnswerSelection {
  kind: ProblemKind;
  /** 切る牌（何切る=手牌/ツモから、鳴き判断=鳴いた後に切る牌）。 */
  tile: Tile | null;
  /** リーチ宣言（何切るのみ意味を持つ）。 */
  riichi: boolean;
  /** 鳴き判断の選択（未選択は null）。 */
  call: "pass" | CallType | null;
}

/** 選択状態から回答アクションを組み立てる（不足していれば null）。
 *  スルー/カンは牌不要、ポン/チーは切る牌が必要（カンは嶺上ツモがあるため打牌を問わない）。 */
export function buildProblemAnswer(sel: ProblemAnswerSelection): ProblemAction | null {
  if (sel.kind === "discard") {
    return sel.tile ? { type: "discard", tile: sel.tile, riichi: sel.riichi } : null;
  }
  if (sel.call === "pass") return { type: "pass" };
  if (sel.call === "kan") return { type: "call", call: "kan", discard: null };
  if (sel.call && sel.tile) return { type: "call", call: sel.call, discard: sel.tile };
  return null;
}

/** 回答を確定できるか（= アクションを組み立てられるか）。 */
export function canSubmitProblemAnswer(sel: ProblemAnswerSelection): boolean {
  return buildProblemAnswer(sel) !== null;
}

/** 「切る牌」の選択が要る状態か（何切る、またはポン/チー選択時）。 */
export function answerNeedsTile(sel: Pick<ProblemAnswerSelection, "kind" | "call">): boolean {
  return sel.kind === "discard" || sel.call === "pon" || sel.call === "chi";
}

/** 手牌の目標枚数（副露は3枚換算。ProblemSchema の枚数整合と同じ前提）。 */
export const PROBLEM_FULL_HAND = 13;

/** 副露数に応じた手牌の上限枚数。 */
export function problemHandMax(meldCount: number): number {
  return Math.max(0, PROBLEM_FULL_HAND - meldCount * 3);
}

/** 問題の各席の河を牌配列へ写す（編集画面の初期状態用。読めない牌はスキップ）。 */
export function problemRiverTiles(problem?: Problem): Record<Seat, Tile[]> {
  const rivers: Record<Seat, Tile[]> = { east: [], south: [], west: [], north: [] };
  if (!problem) return rivers;
  for (const seat of SEAT_ORDER) {
    rivers[seat] = problem.seats[seat].river.flatMap((d) => (d.tile ? [d.tile] : []));
  }
  return rivers;
}

/** 副露を1組追加した編集状態を返す（3枚換算で溢れる手牌は末尾から外す。カンは kan_open）。 */
export function addDraftMeld(
  hand: Tile[],
  melds: Meld[],
  type: MeldPick,
  tile: Tile,
): { hand: Tile[]; melds: Meld[] } {
  const meld: Meld = {
    type: type === "kan" ? "kan_open" : type,
    tiles: meldTiles(type, tile).map((t) => ({ tile: t, confidence: 1 })),
    from: null,
  };
  return { hand: hand.slice(0, problemHandMax(melds.length + 1)), melds: [...melds, meld] };
}

/** 編集画面の入力状態（web/mobile の作成/編集画面が共有する形）。 */
export interface ProblemDraft {
  kind: ProblemKind;
  pov: Seat;
  hand: Tile[];
  melds: Meld[];
  drawn: Tile | null;
  /** 鳴き判断の対象席（kind=call のときだけ使われる）。 */
  targetSeat: Seat;
  rivers: Record<Seat, Tile[]>;
  meta: {
    dealer: Seat | null;
    roundWind: Seat | null;
    honba: number;
    kyotaku: number;
    junme: number;
    dora: Tile[];
  };
  /** 点数状況（入力欄の文字列のまま。null=入力しない）。 */
  scores: Record<Seat, string> | null;
  /** 省略時は既定ルール（Mリーグ相当）。 */
  rules?: Rules;
  ansTile: Tile | null;
  ansRiichi: boolean;
  ansCall: "pass" | CallType | null;
  explanation: string;
}

/**
 * 編集状態から Problem を組み立てて検証する（保存前のクライアント側ゲート）。
 * 答え未選択・スキーマ違反は日本語のエラー文言で返す。kind に応じて
 * ツモ牌/対象席を整形し、河には order 連番を振る。
 */
export function assembleProblem(draft: ProblemDraft): { problem?: Problem; error?: string } {
  const answer = buildProblemAnswer({
    kind: draft.kind,
    tile: draft.ansTile,
    riichi: draft.ansRiichi,
    call: draft.ansCall,
  });
  if (!answer) return { error: "答え（切る牌・鳴くかどうか）を選んでください。" };
  const seats = Object.fromEntries(
    SEAT_ORDER.map((seat) => [
      seat,
      {
        hand: seat === draft.pov ? draft.hand.map((t) => ({ tile: t, confidence: 1 })) : [],
        melds: seat === draft.pov ? draft.melds : [],
        river: draft.rivers[seat].map((tile, i) => ({
          order: i + 1,
          tile,
          riichi: false,
          tsumogiri: false,
          confidence: 1,
        })),
      },
    ]),
  );
  const parsed = ProblemSchema.safeParse({
    schemaVersion: PROBLEM_SCHEMA_VERSION,
    kind: draft.kind,
    pov: draft.pov,
    drawn: draft.kind === "discard" ? draft.drawn : null,
    targetSeat: draft.kind === "call" ? draft.targetSeat : null,
    seats,
    meta: { ...draft.meta, note: "" },
    scores: draft.scores
      ? {
          east: Number(draft.scores.east) || 0,
          south: Number(draft.scores.south) || 0,
          west: Number(draft.scores.west) || 0,
          north: Number(draft.scores.north) || 0,
        }
      : null,
    rules: draft.rules ?? {},
    answer,
    explanation: draft.explanation,
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "入力に誤りがあります。" };
  }
  return { problem: parsed.data };
}

/** 回答アクションの人間向けラベル（例: "5筒切り・リーチ" / "ポンして2萬切り" / "スルー"）。 */
export function actionLabel(action: ProblemAction): string {
  if (action.type === "discard") {
    return `${tileLabel(action.tile)}切り${action.riichi ? "・リーチ" : ""}`;
  }
  if (action.type === "call") {
    const call = CALL_LABELS[action.call];
    return action.discard ? `${call}して${tileLabel(action.discard)}切り` : call;
  }
  return "スルー";
}

/** choiceKey（分布集計のキー）を actionLabel と同じ日本語ラベルへ戻す。
 *  不明なキーはそのまま返す（表示を壊さない）。 */
export function choiceKeyLabel(key: string): string {
  if (key === "pass") return "スルー";
  const [head, a, b] = key.split(":");
  const tileOf = (v: string | undefined): Tile | null => {
    const parsed = TileSchema.safeParse(v);
    return parsed.success ? parsed.data : null;
  };
  if (head === "discard") {
    const tile = tileOf(a);
    if (tile) return actionLabel({ type: "discard", tile, riichi: b === "riichi" });
  }
  if (head === "call" && (a === "pon" || a === "chi" || a === "kan")) {
    const tile = b === undefined ? null : tileOf(b);
    if (b === undefined || tile) return actionLabel({ type: "call", call: a, discard: tile });
  }
  return key;
}

export interface ChoiceRatio {
  key: string;
  count: number;
  ratio: number;
}

/** 回答分布（choiceKey→件数）を件数の多い順＋割合(%)に整える。 */
export function statsRatios(counts: Record<string, number>): ChoiceRatio[] {
  const total = Object.values(counts).reduce((sum, n) => sum + n, 0);
  if (total === 0) return [];
  return Object.entries(counts)
    .map(([key, count]) => ({ key, count, ratio: Math.round((count / total) * 100) }))
    .sort((a, b) => b.count - a.count || a.key.localeCompare(b.key));
}

/**
 * 1牌を修正した新しい牌譜を返す（不変）。
 * 人が直したので confidence は 1（確定）にする。結果は KifuSchema で再検証する。
 * 手牌の修正後は理牌する（河は order 時系列なので並べ替えない）。
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
    if (loc.area === "hand") board.hand = sortHandTiles(board.hand);
  }
  return KifuSchema.parse(draft);
}
