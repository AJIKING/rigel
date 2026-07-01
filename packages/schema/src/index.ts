// ============================================================
// @rigel/schema — 牌譜スキーマ（このアプリの「背骨」）
// ------------------------------------------------------------
// 1つの Zod 定義から TypeScript 型が導出され、
//   - AI(Gemini)出力の実行時バリデーション
//   - Cloudflare D1 への保存形
//   - React Native / Next.js の描画用型
// すべてがこれを参照する。RN・Next・Workers が同じ import を共有する。
//
// schemaVersion を持たせて将来の構造変更に耐える。
// ============================================================

import { z } from "zod";

export const SCHEMA_VERSION = "1.0.0" as const;

// ------------------------------------------------------------
// 牌（天鳳式表記）
//   数牌: 1m–9m(萬) / 1p–9p(筒) / 1s–9s(索)、赤ドラ: 0m 0p 0s
//   字牌: 1z=東 2z=南 3z=西 4z=北 5z=白 6z=發 7z=中
// ------------------------------------------------------------
export const TILE_VALUES = [
  "1m",
  "2m",
  "3m",
  "4m",
  "5m",
  "6m",
  "7m",
  "8m",
  "9m",
  "0m",
  "1p",
  "2p",
  "3p",
  "4p",
  "5p",
  "6p",
  "7p",
  "8p",
  "9p",
  "0p",
  "1s",
  "2s",
  "3s",
  "4s",
  "5s",
  "6s",
  "7s",
  "8s",
  "9s",
  "0s",
  "1z",
  "2z",
  "3z",
  "4z",
  "5z",
  "6z",
  "7z",
] as const;

export const TileSchema = z.enum(TILE_VALUES);
export type Tile = z.infer<typeof TileSchema>;

/** 読み取れなかった牌は null。スロット自体は残して枚数と順序を壊さない。 */
export const MaybeTileSchema = TileSchema.nullable();

/** 確信度 0.0–1.0。低い牌をUIでハイライト → 人が直すワークフローの起点。 */
export const ConfidenceSchema = z.number().min(0).max(1);

/** 牌1枚＋その確信度。手牌・鳴き・河の最小単位。 */
export const ReadTileSchema = z.object({
  tile: MaybeTileSchema,
  confidence: ConfidenceSchema.default(1),
});
export type ReadTile = z.infer<typeof ReadTileSchema>;

// ------------------------------------------------------------
// 席（絶対位置）
//   確定牌譜は東南西北で保持する。
//   AI出力はカメラ相対(bottom/right/top/left)で受け取り、
//   「手前は誰か」の1タップを使ってここへ変換する（下部 toAbsoluteSeat）。
// ------------------------------------------------------------
export const SeatSchema = z.enum(["east", "south", "west", "north"]);
export type Seat = z.infer<typeof SeatSchema>;

// ------------------------------------------------------------
// 鳴き（鳴き元つき）
// ------------------------------------------------------------
export const MeldTypeSchema = z.enum([
  "pon", // ポン
  "chi", // チー
  "kan_open", // 明槓（大明槓）
  "kan_added", // 加槓
  "kan_closed", // 暗槓
]);
export type MeldType = z.infer<typeof MeldTypeSchema>;

export const MeldSchema = z.object({
  type: MeldTypeSchema,
  tiles: z.array(ReadTileSchema).min(3).max(4),
  /** 鳴き元の絶対位置。暗槓(kan_closed)は null。 */
  from: SeatSchema.nullable(),
});
export type Meld = z.infer<typeof MeldSchema>;

// ------------------------------------------------------------
// 河の1打
// ------------------------------------------------------------
export const DiscardSchema = z.object({
  /** 1始まり。河の並び順 = 打牌の時系列。 */
  order: z.number().int().positive(),
  tile: MaybeTileSchema,
  /** 横向きの牌 = リーチ宣言牌。 */
  riichi: z.boolean().default(false),
  /** 自摸切り(ツモった牌をそのまま捨てた)なら true。既定は手出し(false)。UIで少しグレー表示。 */
  tsumogiri: z.boolean().default(false),
  confidence: ConfidenceSchema.default(1),
});
export type Discard = z.infer<typeof DiscardSchema>;

// ------------------------------------------------------------
// 1席ぶんの盤面
// ------------------------------------------------------------
export const SeatBoardSchema = z.object({
  hand: z.array(ReadTileSchema).default([]),
  melds: z.array(MeldSchema).default([]),
  river: z.array(DiscardSchema).default([]),
});
export type SeatBoard = z.infer<typeof SeatBoardSchema>;

// ------------------------------------------------------------
// 半荘ルール（点数計算の前提。docs/rigel-rules-dialog.html を再現）
//   写真から復元できないので手入力。既定は Mリーグ相当。
// ------------------------------------------------------------
export const AkaCountSchema = z.enum(["none", "1", "2"]); // 各色の赤5の枚数
export const RenchanSchema = z.enum(["agari", "tenpai"]); // 親の連荘条件
export const StartPointsSchema = z.enum(["25000", "30000"]); // 持ち点/返し
export const UmaSchema = z.enum(["5-10", "10-20", "10-30"]); // ウマ（順位点・千点）

export const RulesSchema = z.object({
  /** 喰いタン（鳴きタンヤオ）を認める。 */
  kuitan: z.boolean().default(true),
  /** 後付け（片和了）を認める。 */
  atozuke: z.boolean().default(true),
  /** 赤ドラ（各色の赤5）の枚数。 */
  aka: AkaCountSchema.default("1"),
  /** 切り上げ満貫（4飜30符・3飜60符を満貫に）。 */
  kiriage: z.boolean().default(false),
  /** 数え役満（13飜以上を役満扱い）。 */
  kazoe: z.boolean().default(true),
  /** ダブル役満（複数役満の倍加）。 */
  multiYakuman: z.boolean().default(true),
  /** 役満同士の複合を認める。 */
  compYakuman: z.boolean().default(true),
  /** 親の連荘条件（和了連荘 / 聴牌連荘）。 */
  renchan: RenchanSchema.default("tenpai"),
  /** ノーテン罰符（流局時の不聴払い・計3000点）。 */
  noten: z.boolean().default(true),
  /** 途中流局（九種九牌・四風連打・四家立直・四槓散了・三家和）。 */
  ryukyoku: z.boolean().default(false),
  /** 持ち点/返し点（オカの基準）。 */
  start: StartPointsSchema.default("25000"),
  /** ウマ（順位点・千点）。 */
  uma: UmaSchema.default("10-30"),
  /** トビ終了（持ち点0未満で終局）。 */
  tobi: z.boolean().default(false),
});
export type Rules = z.infer<typeof RulesSchema>;

/** ルールプリセット（ダイアログの初期選択に使う）。既定は mleague。 */
export const RULE_PRESETS = {
  mleague: RulesSchema.parse({ renchan: "tenpai", ryukyoku: false, uma: "10-30", tobi: false }),
  tenhou: RulesSchema.parse({ renchan: "agari", ryukyoku: true, uma: "10-20", tobi: true }),
  free: RulesSchema.parse({
    kiriage: true,
    renchan: "tenpai",
    ryukyoku: true,
    uma: "10-20",
    tobi: true,
  }),
} as const satisfies Record<string, Rules>;

// ------------------------------------------------------------
// 和了情報（点数計算の入力。役は人が入力・自動判定はしない）
// ------------------------------------------------------------
export const YakuSchema = z.object({
  name: z.string(),
  han: z.number().int(),
});
export type Yaku = z.infer<typeof YakuSchema>;

export const AgariSchema = z.object({
  /** 和了者。 */
  winner: SeatSchema,
  /** 放銃者。ツモなら null。 */
  from: SeatSchema.nullable().default(null),
  /** 飜（ドラ・赤ドラ込みの合計）。 */
  han: z.number().int().min(0).default(0),
  /** 符。 */
  fu: z.number().int().min(0).default(0),
  /** 役の内訳（名前＋飜）。表示用。 */
  yaku: z.array(YakuSchema).default([]),
  /** リーチ宣言した席。 */
  riichi: z.array(SeatSchema).default([]),
});
export type Agari = z.infer<typeof AgariSchema>;

// ------------------------------------------------------------
// 牌譜 1件（= 課金単位 / D1 の 1 レコード / 共有URLの単位）
// ------------------------------------------------------------
export const ResultSchema = z.enum(["ron", "tsumo", "draw"]);

export const KifuSchema = z.object({
  schemaVersion: z.literal(SCHEMA_VERSION),
  /** ISO8601。撮影/解析した瞬間（= スナップショットの時点）。 */
  capturedAt: z.string().datetime(),
  result: ResultSchema.nullable().default(null),

  /** 撮影時に手前(bottom)だった席。相対→絶対変換の根拠として保存。 */
  cameraBottomSeat: SeatSchema.nullable().default(null),

  seats: z.object({
    east: SeatBoardSchema,
    south: SeatBoardSchema,
    west: SeatBoardSchema,
    north: SeatBoardSchema,
  }),

  /** 写真に写らない情報。点数計算しない方針なので任意。後から手入力で足せる（記録のみ）。 */
  meta: z
    .object({
      dealer: SeatSchema.nullable().default(null),
      roundWind: SeatSchema.nullable().default(null),
      /** 本場（積み棒の数）。 */
      honba: z.number().int().min(0).default(0),
      /** 供託（場に残るリーチ棒の本数）。 */
      kyotaku: z.number().int().min(0).default(0),
      /** ドラ表示牌。未設定は null。点数計算はしないので表示・記録用。 */
      dora: TileSchema.nullable().default(null),
      /** 裏ドラ表示牌。リーチ和了時のみ意味を持つ。未設定は null。表示・記録用。 */
      uraDora: TileSchema.nullable().default(null),
      /** 最終巡目（スナップショット時点）。 */
      junme: z.number().int().min(1).default(1),
      note: z.string().default(""),
    })
    .default({}),

  /** 半荘ルール（点数計算の前提）。省略時は Mリーグ相当の既定。 */
  rules: RulesSchema.default({}),

  /** 和了情報（点数計算の入力）。流局・未入力は null。 */
  agari: AgariSchema.nullable().default(null),

  /** 解析時の読み取り困難メモ（グレア・ブレ・見切れ等）。AIのnotesを引き継ぐ。 */
  readingNotes: z.string().default(""),
});
export type Kifu = z.infer<typeof KifuSchema>;

// ============================================================
// AI出力スキーマ（Gemini の生レスポンス検証用）
// ------------------------------------------------------------
// カメラ相対(bottom/right/top/left)。人の修正前の「ドラフト」。
// 河は4分割して1方向ずつ、手牌は1人ずつ投げ、各レスポンスをこれで検証してから
// Kifu(絶対位置) に組み立てる。
// ============================================================
export const CameraSeatSchema = z.enum(["bottom", "right", "top", "left"]);
export type CameraSeat = z.infer<typeof CameraSeatSchema>;

/** 河1方向ぶんのAI出力（river_reader_prompt.md の1方向版に対応）。 */
export const AiRiverResponseSchema = z.object({
  discards: z.array(DiscardSchema),
  notes: z.string().default(""),
});
export type AiRiverResponse = z.infer<typeof AiRiverResponseSchema>;

/** 手牌1人ぶんのAI出力。鳴き元もカメラ相対で出させ、変換時に絶対へ。 */
export const AiHandResponseSchema = z.object({
  hand: z.array(ReadTileSchema),
  melds: z
    .array(
      z.object({
        type: MeldTypeSchema,
        tiles: z.array(ReadTileSchema),
        from: CameraSeatSchema.nullable(),
      }),
    )
    .default([]),
  notes: z.string().default(""),
});
export type AiHandResponse = z.infer<typeof AiHandResponseSchema>;

// ============================================================
// カメラ相対 → 絶対位置の変換
// ------------------------------------------------------------
// 「手前(bottom)は誰か」が1つ決まれば、残り3方向も卓の座順で決まる。
//
// ⚠️ 下の回転方向(下家がカメラのどちら側に座るか)は、撮影の向きに依存する。【未確定／要実機検証】
//    実機で1回だけ「東家を手前に置いた写真」を撮って、right/top/left が
//    南/西/北 で合っているか必ず目視確認すること。合わなければ CAMERA_ORDER を反転。
// ============================================================
const SEAT_ORDER: readonly Seat[] = ["east", "south", "west", "north"]; // 下家方向の座順
const CAMERA_ORDER: readonly CameraSeat[] = ["bottom", "right", "top", "left"]; // ⚠️要実機検証

/** bottom の席を起点に、カメラ相対の席を絶対位置へ写像する。 */
export function toAbsoluteSeat(camera: CameraSeat, bottomSeat: Seat): Seat {
  const camIdx = CAMERA_ORDER.indexOf(camera);
  const baseIdx = SEAT_ORDER.indexOf(bottomSeat);
  return SEAT_ORDER[(baseIdx + camIdx) % 4];
}

// ============================================================
// 使い方の例（擬似コード）
// ------------------------------------------------------------
// const raw = JSON.parse(geminiText);
// const river = AiRiverResponseSchema.parse(raw); // 不正な出力はここで弾ける
// const seat  = toAbsoluteSeat("left", "east");   // => （要実機検証で確定する想定）
// kifu.seats[seat].river = river.discards;
// KifuSchema.parse(kifu); // 保存前に全体を最終検証
// ============================================================
