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
  normalizeRed,
  problemTargetTile,
  type CallType,
  type CameraSeat,
  type Kifu,
  type Meld,
  type Problem,
  type ProblemAction,
  type ProblemKind,
  type ReadTile,
  type Rules,
  type Players,
  type Seat,
  type Tile,
} from "@rigel/schema";
import { chiVariants, meldTiles, sortHandTiles, SUITS, type MeldPick } from "./edit";

// 打点計算（han/fu + ルール → 支払い）。
export * from "./score";
// 役カタログ（点数計算の入力補助）。
export * from "./yaku";
export * from "./tenpai";
// 局跨ぎの点棒集計（持ち点・成績）。
export * from "./standings";
// 手順（タイムライン）の導出・巡目・盤面同期。
export * from "./timeline";
import { reconcileTimeline } from "./timeline";
// 再生ステップごとの局面導出。
export * from "./playback";
// 盤面表示の共有ヘルパ（自風・局名・河の巡送り）。
export * from "./board";
// 牌譜の編集操作（追加/削除/フラグ/鳴き）とピッカー素材。
export * from "./edit";

export * from "./analytics";
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

/** リーグ戦ポイントの符号つき表示（"+12.3" / "-4.0"。正は + を付ける。不正値は "0.0"）。
 *  エディタのポイント入力と再生画面のネームプレートで共用する。 */
export function signedPoints(n: number): string {
  if (!Number.isFinite(n)) return "0.0";
  return (n >= 0 ? "+" : "") + n.toFixed(1);
}

/** 選手情報の入力欄の形（席ごとの文字列）。playersFromInput / playersToInput で相互変換する。 */
export type PlayersInput = Record<Seat, { name: string; points: string }>;

/** 選手情報の入力（文字列）から Players を組む（web/mobile の編集画面で共用）。
 *  名前は trim、ポイントは数値化して小数1桁へ丸める（不正値・Infinity は 0。
 *  schema の finite 制約・表示の signedPoints と整合）。全席が空（名前なし・0pt）なら
 *  null（＝選手情報を記録しない対局）を返す。 */
export function playersFromInput(input: PlayersInput): Players | null {
  const info = (seat: Seat) => {
    const n = parseFloat(input[seat].points);
    return {
      name: input[seat].name.trim(),
      points: Number.isFinite(n) ? Math.round(n * 10) / 10 : 0,
    };
  };
  const p = { east: info("east"), south: info("south"), west: info("west"), north: info("north") };
  const empty = Object.values(p).every((v) => v.name === "" && v.points === 0);
  return empty ? null : p;
}

/** Players から入力欄の初期値（文字列）を組む（playersFromInput の逆変換）。null は全席空。 */
export function playersToInput(players: Players | null): PlayersInput {
  const info = (seat: Seat) => ({
    name: players?.[seat].name ?? "",
    points: String(players?.[seat].points ?? 0),
  });
  return { east: info("east"), south: info("south"), west: info("west"), north: info("north") };
}

const SEAT_LABELS: Record<Seat, string> = { east: "東", south: "南", west: "西", north: "北" };

/** 席の日本語ラベル。 */
export function seatLabel(seat: Seat): string {
  return SEAT_LABELS[seat];
}

/** 鳴かれた捨て牌（calledBy）の共通表記（「鳴きなし」「鳴き→南家」）。
 *  選手名があれば名前を優先する（「鳴き→太郎」）。
 *  web の手順タブ・mobile の手順タブ/編集チップで共用する（表記ゆれ防止）。 */
export function calledByLabel(calledBy: Seat | null, name?: string | null): string {
  if (!calledBy) return "鳴きなし";
  return `鳴き→${name || `${seatLabel(calledBy)}家`}`;
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
    case 429:
      return "混み合っています。少し待って再度お試しください。";
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

/** 当月の解析枠の表示（設定のプランカード・撮影画面で共用）。
 *  /me が枠を返す前（auth 直後）や free（枠0）は null = 出さない。 */
export function analysisQuotaLabel(remaining?: number, quota?: number): string | null {
  if (remaining === undefined || quota === undefined || quota <= 0) return null;
  return `解析枠 残り ${remaining} / ${quota}（今月）`;
}

/** 設定画面の現在プランカードのサブ表示（web/mobile 共通）。
 *  価格は出さない（実際の請求額は購入経路=Stripe/ストアで異なる）。
 *  free は「無料」、有料は当月の解析枠、枠未取得（auth 直後）は null。 */
export function planCardSubLabel(plan: Plan, remaining?: number, quota?: number): string | null {
  return plan === "free" ? "無料" : analysisQuotaLabel(remaining, quota);
}

/** ストア（アプリ内課金）管理の購読か。/me の planStore（RevenueCat の store 値）で判定する。
 *  IAP 購読は Stripe ポータルでは扱えない（404）ためストアの購読設定へ案内する。
 *  未知の将来 store 値は安全側（ストア案内）に倒し、STRIPE と経路不明（null=既存加入者）だけ
 *  ポータルへ流す。 */
export function isStoreManagedSubscription(planStore?: string | null): boolean {
  return !!planStore && planStore !== "STRIPE";
}

/** ストア（アプリ内課金）経由の月額（円）。ストア手数料を織り込んだ掲載価格で、
 *  **App Store Connect / Play Console の設定値と必ず一致させる**（[決定] 2026-07-09。
 *  web=Stripe の ¥480/¥1,480 より高い。表示専用＝実際の請求はストアの設定が正）。 */
const PLAN_MONTHLY_PRICE_STORE: Record<Plan, number> = { free: 0, next: 700, pro: 1800 };

export function planMonthlyPriceAppStore(plan: Plan): number {
  return PLAN_MONTHLY_PRICE_STORE[plan];
}

// ------------------------------------------------------------
// 公開フィードの絞り込み（web/mobile 共通。選択肢と意味をここで一元定義する）
// ------------------------------------------------------------
export type FeedFilterKey = "new" | "week" | "fav";

/** 公開牌譜フィードの絞り込み選択肢（キー＋表示ラベル）。 */
export const PUBLIC_FEED_FILTERS: readonly { key: FeedFilterKey; label: string }[] = [
  { key: "new", label: "新着" },
  { key: "week", label: "今週" },
  { key: "fav", label: "お気に入り" },
];

/** 「今週」の窓（直近7日・ちょうど7日前を含む）。 */
const WEEK_MS = 7 * 24 * 3600 * 1000;

/**
 * 公開フィードの絞り込み＋新着順ソート（純関数）。
 * new=全件 / week=直近7日 / fav=お気に入り（favs に入っている id）のみ。並びは常に新しい順。
 * now はテストの決定性のため注入可能。
 */
export function filterPublicFeed<T extends { id: string; createdAt: string }>(
  cards: readonly T[],
  filter: FeedFilterKey,
  favs: ReadonlySet<string>,
  now: number = Date.now(),
): T[] {
  let arr = [...cards];
  if (filter === "week") {
    const cutoff = new Date(now - WEEK_MS).toISOString();
    arr = arr.filter((c) => c.createdAt >= cutoff);
  } else if (filter === "fav") {
    arr = arr.filter((c) => favs.has(c.id));
  }
  // ISO8601 は文字列比較で時系列順になる。
  return arr.sort((a, b) => (b.createdAt < a.createdAt ? -1 : b.createdAt > a.createdAt ? 1 : 0));
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
  /** ツモ切り（何切るのみ意味を持つ。ツモ牌をタップした=true、手牌から=false）。 */
  tsumogiri: boolean;
  /** 鳴き判断の選択（未選択は null）。 */
  call: "pass" | CallType | null;
  /** チーの構成（鳴いた牌を含む順子3枚。チー以外・未選択は null/省略）。 */
  chiTiles?: Tile[] | null;
}

/** 選択状態から回答アクションを組み立てる（不足していれば null）。
 *  スルー/カンは牌不要、ポン/チーは切る牌が必要（カンは嶺上ツモがあるため打牌を問わない）。 */
export function buildProblemAnswer(sel: ProblemAnswerSelection): ProblemAction | null {
  if (sel.kind === "discard") {
    return sel.tile
      ? { type: "discard", tile: sel.tile, riichi: sel.riichi, tsumogiri: sel.tsumogiri }
      : null;
  }
  if (sel.call === "pass") return { type: "pass" };
  if (sel.call === "kan") return { type: "call", call: "kan", chiTiles: null, discard: null };
  if (sel.call && sel.tile) {
    return {
      type: "call",
      call: sel.call,
      // 構成はチーのみ（567/678/789 の鳴き方を区別して集計する）。
      chiTiles: sel.call === "chi" ? (sel.chiTiles ?? null) : null,
      discard: sel.tile,
    };
  }
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

/** 視点席の理牌済み手牌の牌コード（一覧サムネ・OG画像カードで共用）。
 *  ProblemSchema は視点手牌の null を禁じているため通常すべて確定牌だが、
 *  型上の null は除いて Tile[] に絞る。 */
export function problemHandTiles(problem: Problem): Tile[] {
  return sortHandTiles(problem.seats[problem.pov].hand)
    .map((t) => t.tile)
    .filter((t): t is Tile => t !== null);
}

/** 回答UIで選択中の「切る牌」。牌コードでなく位置で持つ（同じ牌が手牌に2枚
 *  あっても選択枠は1枚だけに付く）。index は理牌済み手牌内の位置、ツモ牌は -1。 */
export interface PickedTile {
  tile: Tile;
  drawn: boolean;
  index: number;
}

/** 切る牌の選択トグル（web/mobile の回答画面が共有）。同じ位置の再タップで解除、
 *  別の位置なら選択が移る。位置は index + drawn の組で同一判定する。 */
export function togglePickedTile(
  picked: PickedTile | null,
  tile: Tile,
  drawn: boolean,
  index: number,
): PickedTile | null {
  return picked?.index === index && picked.drawn === drawn ? null : { tile, drawn, index };
}

/** 手牌の目標枚数（副露は3枚換算。ProblemSchema の枚数整合と同じ前提）。 */
export const PROBLEM_FULL_HAND = 13;

/** 副露数に応じた手牌の上限枚数。 */
export function problemHandMax(meldCount: number): number {
  return Math.max(0, PROBLEM_FULL_HAND - meldCount * 3);
}

/** 局ラベル（例: "東場 6巡目"。場風が無ければ巡目のみ）。卓中央の表示で共用する。 */
export function problemRoundLabel(meta: { roundWind: Seat | null; junme: number }): string {
  const wind = meta.roundWind ? `${seatLabel(meta.roundWind)}場 ` : "";
  return `${wind}${meta.junme}巡目`;
}

/** 編集画面の河の1牌（ツモ切り/手出しを持つ。リーチ表示は問題では扱わない）。 */
export interface DraftRiverTile {
  tile: Tile;
  tsumogiri: boolean;
}

/** 問題の各席の河をツモ切りフラグ付きで写す（編集画面の初期状態用。読めない牌はスキップ）。 */
export function problemRiverTiles(problem?: Problem): Record<Seat, DraftRiverTile[]> {
  const rivers: Record<Seat, DraftRiverTile[]> = { east: [], south: [], west: [], north: [] };
  if (!problem) return rivers;
  for (const seat of SEAT_ORDER) {
    rivers[seat] = problem.seats[seat].river.flatMap((d) =>
      d.tile ? [{ tile: d.tile, tsumogiri: d.tsumogiri }] : [],
    );
  }
  return rivers;
}

// ---- 河ドラフトの編集（web/mobile の何切る編集で共用。牌タップ→変更/削除/ツモ切り） ----

/** 「riveredit:席:index」のターゲット文字列を分解する（該当しなければ null）。 */
export function parseRiverEditTarget(
  t: string | null | undefined,
): { seat: Seat; index: number } | null {
  if (!t?.startsWith("riveredit:")) return null;
  const [, seat, index] = t.split(":");
  return { seat: seat as Seat, index: Number(index) };
}

/** 指定位置の牌だけ置き換える（ツモ切りフラグは保持・不変更新）。 */
export function replaceDraftRiverTile(
  rivers: Record<Seat, DraftRiverTile[]>,
  seat: Seat,
  index: number,
  tile: Tile,
): Record<Seat, DraftRiverTile[]> {
  return { ...rivers, [seat]: rivers[seat].map((d, j) => (j === index ? { ...d, tile } : d)) };
}

/** 指定位置のツモ切りフラグだけ反転する（不変更新）。 */
export function toggleDraftRiverTsumogiri(
  rivers: Record<Seat, DraftRiverTile[]>,
  seat: Seat,
  index: number,
): Record<Seat, DraftRiverTile[]> {
  return {
    ...rivers,
    [seat]: rivers[seat].map((d, j) => (j === index ? { ...d, tsumogiri: !d.tsumogiri } : d)),
  };
}

/** 指定位置の牌を外す（不変更新）。 */
export function removeDraftRiverTile(
  rivers: Record<Seat, DraftRiverTile[]>,
  seat: Seat,
  index: number,
): Record<Seat, DraftRiverTile[]> {
  return { ...rivers, [seat]: rivers[seat].filter((_, j) => j !== index) };
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
  rivers: Record<Seat, DraftRiverTile[]>;
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
  /** 出題者の解説・コメント（正解は設けない）。 */
  explanation: string;
}

/** 盤面プレビューに必要な編集状態のサブセット（答え・解説は不要）。 */
export type ProblemBoardDraft = Pick<ProblemDraft, "pov" | "hand" | "melds" | "rivers" | "meta"> &
  Partial<Pick<ProblemDraft, "rules">>;

/**
 * 編集途中の状態を検証なしで盤面プレビュー用の Kifu に写す（枚数不足でも描ける）。
 * 保存前の確認は assembleProblem（検証あり）、表示は problemToKifu（検証済み Problem 用）と使い分ける。
 */
export function draftToKifu(draft: ProblemBoardDraft): Kifu {
  const seats = Object.fromEntries(
    SEAT_ORDER.map((seat) => [
      seat,
      {
        hand:
          seat === draft.pov
            ? sortHandTiles(draft.hand.map((tile) => ({ tile, confidence: 1 })))
            : [],
        melds: seat === draft.pov ? draft.melds : [],
        river: draft.rivers[seat].map((d, i) => ({
          order: i + 1,
          tile: d.tile,
          riichi: false,
          tsumogiri: d.tsumogiri,
          confidence: 1,
        })),
      },
    ]),
  );
  return KifuSchema.parse({
    schemaVersion: SCHEMA_VERSION,
    capturedAt: "2026-01-01T00:00:00.000Z",
    cameraBottomSeat: draft.pov,
    seats,
    meta: { ...draft.meta, note: "" },
    rules: draft.rules ?? {},
  });
}

/**
 * 編集状態から Problem を組み立てて検証する（保存前のクライアント側ゲート）。
 * スキーマ違反は日本語のエラー文言で返す。kind に応じてツモ牌/対象席を整形し、
 * 河には order 連番を振る。正解は設けない（多様な正解を前提に分布を見る）。
 */
export function assembleProblem(draft: ProblemDraft): { problem?: Problem; error?: string } {
  const seats = Object.fromEntries(
    SEAT_ORDER.map((seat) => [
      seat,
      {
        hand: seat === draft.pov ? draft.hand.map((t) => ({ tile: t, confidence: 1 })) : [],
        melds: seat === draft.pov ? draft.melds : [],
        river: draft.rivers[seat].map((d, i) => ({
          order: i + 1,
          tile: d.tile,
          riichi: false,
          tsumogiri: d.tsumogiri,
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
    explanation: draft.explanation,
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "入力に誤りがあります。" };
  }
  return { problem: parsed.data };
}

/** kifuToProblemDraft が返す要確認牌（低 confidence で読まれた牌）。 */
export interface DraftReviewTile {
  tile: Tile;
  confidence: number;
}

/** 要確認牌の共通表記（例「要確認: 1萬(0.4)、9索(0.5)」。空なら空文字）。web/mobile で共用。 */
export function reviewSummaryLabel(review: DraftReviewTile[]): string {
  if (review.length === 0) return "";
  return `要確認: ${review.map((r) => `${tileLabel(r.tile)}(${r.confidence.toFixed(1)})`).join("、")}`;
}

/**
 * AIドラフト（写真解析結果の Kifu 形）を何切る編集ドラフト（ProblemDraft）へ写す。
 * Problem は確定牌のみの世界なので、null 牌（読めなかった牌）は落とす＝推測して埋めない。
 * null を含む副露も丸ごと落とし、残った副露で手牌上限（13 - 3×副露）を数える。
 * 手牌が上限を超えて読めたら、読み順の末尾をツモ欄に置く（[決定] 2026-07-14。作者が直せる）。
 * それでも入り切らない牌は省き、readingNotes で告げる（黙って捨てない）。
 * Problem は confidence を持てないため、低確信の牌は review として返し UI で明示する
 * （「自信満々の誤読を出さない」＝確定牌への無言の昇格を防ぐ信頼ゲート）。
 */
export function kifuToProblemDraft(
  kifu: Kifu,
  pov: Seat,
): { draft: ProblemDraft; readingNotes: string; review: DraftReviewTile[] } {
  const board = kifu.seats[pov];
  const melds = board.melds.filter((m) => m.tiles.every((t) => t.tile !== null));
  const tiles = board.hand.flatMap((t) => (t.tile ? [t.tile] : []));
  const max = problemHandMax(melds.length);
  const overflow = tiles.length > max;
  const drawn = overflow ? tiles[tiles.length - 1]! : null;
  const hand = sortHandTiles(
    (overflow ? tiles.slice(0, -1) : tiles).slice(0, max).map((tile) => ({ tile, confidence: 1 })),
  ).flatMap((t) => (t.tile ? [t.tile] : []));
  const rivers = Object.fromEntries(
    SEAT_ORDER.map((seat) => [
      seat,
      kifu.seats[seat].river.flatMap((d) =>
        d.tile ? [{ tile: d.tile, tsumogiri: d.tsumogiri }] : [],
      ),
    ]),
  ) as Record<Seat, DraftRiverTile[]>;

  // 低 confidence で読まれた牌（手牌・副露・全席の河）。UI が「要確認」として人に見せる。
  const review: DraftReviewTile[] = [];
  const collect = (t: ReadTile) => {
    if (t.tile !== null && needsReview(t)) review.push({ tile: t.tile, confidence: t.confidence });
  };
  board.hand.forEach(collect);
  melds.forEach((m) => m.tiles.forEach(collect));
  SEAT_ORDER.forEach((seat) => kifu.seats[seat].river.forEach(collect));

  // 上限＋ツモ1枚に入り切らず省いた枚数（黙って捨てない）。
  const dropped = overflow ? Math.max(0, tiles.length - 1 - max) : 0;
  const readingNotes = [
    kifu.readingNotes,
    dropped > 0 ? `読み取った手牌が多すぎたため${dropped}枚を省きました。` : "",
  ]
    .filter(Boolean)
    .join(" ");

  return {
    review,
    readingNotes,
    draft: {
      kind: "discard",
      pov,
      hand,
      melds,
      drawn,
      // 鳴き判断へ切り替えたときの対象席の既定（自席は不可なので下家）。
      targetSeat: SEAT_ORDER[(SEAT_ORDER.indexOf(pov) + 1) % 4]!,
      rivers,
      meta: {
        dealer: kifu.meta.dealer,
        roundWind: kifu.meta.roundWind,
        honba: kifu.meta.honba,
        kyotaku: kifu.meta.kyotaku,
        junme: kifu.meta.junme,
        dora: kifu.meta.dora,
      },
      scores: null,
      rules: kifu.rules,
      explanation: "",
    },
  };
}

/** チー構成の表示（例 "345筒"。赤5は5表記＝集計キーと同じ同一視。スート名は SUITS と共用）。 */
export function chiRunLabel(run: Tile[]): string {
  const digits = run
    .map((t) => normalizeRed(t)[0]!)
    .sort()
    .join("");
  return `${digits}${SUITS.find((s) => s.suit === run[0]![1])?.label ?? ""}`;
}

/** 鳴き判断（チー）の構成候補: 対象牌（河末尾）を含む順子のうち、残り2枚を回答者(pov)の
 *  手牌から出せるもの。候補の牌は手牌の実コードに合わせる（赤5は 0x のまま）。 */
export function problemChiVariants(problem: Problem): Tile[][] {
  if (problem.kind !== "call") return [];
  const target = problemTargetTile(problem);
  if (!target) return [];
  const hand = problem.seats[problem.pov].hand.flatMap((t) => (t.tile ? [t.tile] : []));
  const out: Tile[][] = [];
  for (const run of chiVariants(target)) {
    const pool = [...hand];
    const resolved: Tile[] = [];
    let ok = true;
    for (const t of run) {
      if (t === target) {
        resolved.push(t);
        continue;
      }
      // 手牌から実コードで取り出す（無ければ赤5同一視で探す）。同じ牌は1枚ずつ消費。
      let i = pool.indexOf(t);
      if (i < 0) i = pool.findIndex((h) => normalizeRed(h) === normalizeRed(t));
      if (i < 0) {
        ok = false;
        break;
      }
      resolved.push(pool[i]!);
      pool.splice(i, 1);
    }
    if (ok) out.push(resolved);
  }
  return out;
}

/** 回答アクションの人間向けラベル
 *  （例: "5筒切り・リーチ" / "5筒ツモ切り" / "345筒でチーして2萬切り" / "スルー"）。 */
export function actionLabel(action: ProblemAction): string {
  if (action.type === "discard") {
    const cut = action.tsumogiri ? "ツモ切り" : "切り";
    return `${tileLabel(action.tile)}${cut}${action.riichi ? "・リーチ" : ""}`;
  }
  if (action.type === "call") {
    const call = CALL_LABELS[action.call];
    const head =
      action.call === "chi" && action.chiTiles ? `${chiRunLabel(action.chiTiles)}で${call}` : call;
    return action.discard ? `${head}して${tileLabel(action.discard)}切り` : head;
  }
  return "スルー";
}

/** choiceKey（分布集計のキー）を actionLabel と同じ日本語ラベルへ戻す。
 *  不明なキーはそのまま返す（表示を壊さない）。 */
export function choiceKeyLabel(key: string): string {
  if (key === "pass") return "スルー";
  const [head, a, ...rest] = key.split(":");
  const tileOf = (v: string | undefined): Tile | null => {
    const parsed = TileSchema.safeParse(v);
    return parsed.success ? parsed.data : null;
  };
  if (head === "discard") {
    const tile = tileOf(a);
    // サフィックスは riichi / tsumogiri のみ（choiceKey の生成順に依らず集合で解釈）。
    const flags = new Set(rest);
    const known = [...flags].every((f) => f === "riichi" || f === "tsumogiri");
    if (tile && known) {
      return actionLabel({
        type: "discard",
        tile,
        riichi: flags.has("riichi"),
        tsumogiri: flags.has("tsumogiri"),
      });
    }
  }
  if (head === "call" && (a === "pon" || a === "chi" || a === "kan")) {
    // チーの構成キー（例 "345p"）が挟まる形: call:chi:<構成>:<切る牌>。旧キーは構成なし。
    const run = a === "chi" && rest[0] && /^[1-9]{3}[mps]$/.test(rest[0]) ? rest[0] : null;
    const after = run ? rest.slice(1) : rest;
    const b = after[0];
    const tile = b === undefined ? null : tileOf(b);
    if (after.length === 0 || (after.length === 1 && tile)) {
      const chiTiles = run ? ([0, 1, 2].map((k) => `${run[k]}${run[3]}`) as Tile[]) : null;
      return actionLabel({ type: "call", call: a, chiTiles, discard: tile });
    }
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
  const next = KifuSchema.parse(draft);
  // 河・鳴きの牌変更は手順(timeline)にも反映（手牌は timeline に無いので対象外）。
  // timeline 非空時のみ正規化同期（空なら deriveTimeline が seats から導出）。
  return loc.area !== "hand" && next.timeline.length > 0 ? reconcileTimeline(next) : next;
}
