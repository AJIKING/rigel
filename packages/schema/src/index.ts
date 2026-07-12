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
// 手順（タイムライン）イベント
//   全席横断の時系列。打牌(手出し/ツモ切り)と鳴きを1列に並べる。これを正典とし、
//   盤面(席ごと river/melds)と巡目はここから導出する（段階移行。設計: docs/designs/timeline-editor.md）。
// ------------------------------------------------------------

/** 打牌イベント（ツモ→捨て）。 */
export const DiscardEventSchema = z.object({
  kind: z.literal("discard"),
  /** 打牌した席（絶対位置）。 */
  seat: SeatSchema,
  /** ツモ牌。写真から復元できないことが多く任意（不明/なしは null）。 */
  draw: MaybeTileSchema.default(null),
  /** 捨て牌。 */
  tile: MaybeTileSchema,
  /** 自摸切り（ツモ牌をそのまま捨てた）なら true。既定は手出し。 */
  tsumogiri: z.boolean().default(false),
  /** 横向きの牌 = リーチ宣言牌。 */
  riichi: z.boolean().default(false),
  confidence: ConfidenceSchema.default(1),
});
export type DiscardEvent = z.infer<typeof DiscardEventSchema>;

/** 鳴きイベント（既存 Meld を時系列上に置く）。 */
export const MeldEventSchema = z.object({
  kind: z.literal("meld"),
  /** 鳴いた席（絶対位置）。 */
  seat: SeatSchema,
  meld: MeldSchema,
});
export type MeldEvent = z.infer<typeof MeldEventSchema>;

export const TimelineEventSchema = z.discriminatedUnion("kind", [
  DiscardEventSchema,
  MeldEventSchema,
]);
export type TimelineEvent = z.infer<typeof TimelineEventSchema>;

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
  /** 切り上げ満貫（4飜30符・3飜60符を満貫に）。既定は Mリーグ相当＝あり。 */
  kiriage: z.boolean().default(true),
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
  /** ダブロン（1つの捨て牌で2人が同時和了）を認める。既定は Mリーグ相当の頭ハネ=無効。 */
  doubleRon: z.boolean().default(false),
  /** トリプルロン（3人同時和了）を認める（無効なら三家和で流局）。 */
  tripleRon: z.boolean().default(false),
});
export type Rules = z.infer<typeof RulesSchema>;

/** ルールプリセット（ダイアログの初期選択に使う）。既定は mleague。 */
export const RULE_PRESETS = {
  mleague: RulesSchema.parse({ renchan: "tenpai", ryukyoku: false, uma: "10-30", tobi: false }),
  tenhou: RulesSchema.parse({
    // 天鳳は切り上げ満貫なし（既定=Mリーグ相当のあり、を明示的に外す）。
    kiriage: false,
    renchan: "agari",
    ryukyoku: true,
    uma: "10-20",
    tobi: true,
    doubleRon: true,
  }),
  free: RulesSchema.parse({
    renchan: "tenpai",
    ryukyoku: true,
    uma: "10-20",
    tobi: true,
    doubleRon: true,
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
  /** 和了牌。 */
  winTile: TileSchema.nullable().default(null),
  /** 役の内訳（名前＋飜）。合計飜はこれ＋ドラ枚数で決まる。 */
  yaku: z.array(YakuSchema).default([]),
  /** 符。 */
  fu: z.number().int().min(0).default(0),
  /** 表ドラの枚数（1枚1飜）。 */
  dora: z.number().int().min(0).default(0),
  /** 赤ドラの枚数（1枚1飜）。 */
  aka: z.number().int().min(0).default(0),
  /** 裏ドラの枚数（リーチ和了のみ・1枚1飜）。 */
  ura: z.number().int().min(0).default(0),
  /** リーチ宣言した席。 */
  riichi: z.array(SeatSchema).default([]),
});
export type Agari = z.infer<typeof AgariSchema>;

/** 和了の合計飜（役の飜 ＋ 表/赤/裏ドラ枚数）。 */
export function totalHan(agari: Agari): number {
  return agari.yaku.reduce((n, y) => n + y.han, 0) + agari.dora + agari.aka + agari.ura;
}

// ------------------------------------------------------------
// 牌譜 1件（= 課金単位 / D1 の 1 レコード / 共有URLの単位）
// ------------------------------------------------------------
export const ResultSchema = z.enum(["ron", "tsumo", "draw"]);

/** 選手1人ぶんの情報（リーグ戦等の表示用）。
 *  半荘の全局に複製保存されるため、上限は UI ではなく schema で強制する（信頼ゲート）。 */
export const PlayerInfoSchema = z.object({
  /** 選手名（20文字まで。空なら「◯家」表示にフォールバック）。 */
  name: z.string().max(20).default(""),
  /** 半荘開始時点の積み上げポイント（リーグ戦の順位状況。+120.3 など小数1桁想定）。 */
  points: z.number().finite().default(0),
});
export type PlayerInfo = z.infer<typeof PlayerInfoSchema>;

/** 4席ぶんの選手情報（席の絶対位置キー）。 */
export const PlayersSchema = z.object({
  east: PlayerInfoSchema.default({}),
  south: PlayerInfoSchema.default({}),
  west: PlayerInfoSchema.default({}),
  north: PlayerInfoSchema.default({}),
});
export type Players = z.infer<typeof PlayersSchema>;

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
      /** ドラ表示牌（複数枚＝カンで増える。最大5）。点数計算はしないので表示・記録用。
       *  旧データの単一値（Tile / null）は配列へ移行する（後方互換）。 */
      dora: z
        .preprocess(
          (v) => (v == null ? [] : Array.isArray(v) ? v : [v]),
          z.array(TileSchema).max(5),
        )
        .default([]),
      /** 裏ドラ表示牌（複数枚。リーチ和了時のみ意味を持つ）。表示・記録用。 */
      uraDora: z
        .preprocess(
          (v) => (v == null ? [] : Array.isArray(v) ? v : [v]),
          z.array(TileSchema).max(5),
        )
        .default([]),
      /** 最終巡目（スナップショット時点）。 */
      junme: z.number().int().min(1).default(1),
      note: z.string().default(""),
    })
    .default({}),

  /** 半荘ルール（点数計算の前提）。省略時は Mリーグ相当の既定。 */
  rules: RulesSchema.default({}),

  /** 選手情報（リーグ戦などの選手名と持ちポイント。写真に写らない記録用で
   *  点数計算には使わない）。rules と同じく半荘単位＝配下の全局で共有する。
   *  無ければ null（後方互換・ポイント状況を記録しない対局）。 */
  players: PlayersSchema.nullable().default(null),

  /** 和了情報（点数計算の入力）。ダブロン/トリプルロンは複数件。流局・未入力は空配列。
   *  旧データの単一オブジェクト/null は配列へ移行する。 */
  agari: z
    .preprocess((v) => (Array.isArray(v) ? v : v == null ? [] : [v]), z.array(AgariSchema))
    .default([]),

  /** 流局時の聴牌者（席の絶対位置）。不聴罰符の受け渡し計算に使う（点数は牌姿から
   *  出せないため聴牌者だけ記録し、罰符3000は席数から算出）。和了局・未入力は空配列。 */
  tenpai: z.array(SeatSchema).default([]),

  /** 解析時の読み取り困難メモ（グレア・ブレ・見切れ等）。AIのnotesを引き継ぐ。 */
  readingNotes: z.string().default(""),

  /** 手順（タイムライン）。打牌・鳴きの全席横断の時系列。省略時は空（後方互換）。
   *  盤面/巡目はここから導出する正典（設計: docs/designs/timeline-editor.md）。 */
  timeline: z.array(TimelineEventSchema).default([]),
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

// ============================================================
// 何切る問題（作成・回答・分布キー）
// ------------------------------------------------------------
// AI 非関与・全て手入力の出題データ。牌は Tile 確定値（confidence 概念なし）。
// 出題形式:
//   discard: 手牌13枚+ツモ1枚から何を切るか（リーチ有無つき）
//   call   : 対象席の「河の末尾の1枚」を鳴くか（スルー/ポン/チー/カン→鳴く場合のみ切る牌）
// 牌理検証（チーは上家からか等）はしない（作者責任。Plan: docs/plans/nanikiru.md）。
// ============================================================

/** 鳴きの種別（回答の選択式）。カンの細分（明槓/暗槓/加槓）は問わない。 */
export const CallTypeSchema = z.enum(["pon", "chi", "kan"]);
export type CallType = z.infer<typeof CallTypeSchema>;

const DiscardActionSchema = z.object({
  type: z.literal("discard"),
  /** 切る牌。 */
  tile: TileSchema,
  /** リーチ宣言するか。 */
  riichi: z.boolean().default(false),
  /** ツモ切りか（ツモ牌をそのまま切る）。false=手出し。既定 false（既存データ互換）。 */
  tsumogiri: z.boolean().default(false),
});

const CallActionSchema = z.object({
  type: z.literal("call"),
  call: CallTypeSchema,
  /** 鳴いた後に切る牌。ポン/チーは必須、カンは嶺上ツモがあるため null 固定。 */
  discard: TileSchema.nullable().default(null),
});

const PassActionSchema = z.object({
  type: z.literal("pass"),
});

export const ProblemActionSchema = z
  .discriminatedUnion("type", [DiscardActionSchema, CallActionSchema, PassActionSchema])
  .superRefine((action, ctx) => {
    if (action.type !== "call") return;
    if (action.call === "kan" && action.discard !== null) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "カンは切る牌を持たない（嶺上ツモ後の打牌は問わない）",
      });
    }
    if (action.call !== "kan" && action.discard === null) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "ポン/チーは切る牌が必須" });
    }
  });
export type ProblemAction = z.infer<typeof ProblemActionSchema>;

/**
 * 回答の直列化キー（分布集計の単位）。同じ手は必ず同じキーになる。
 * 同じ牌でもリーチ有無・ツモ切り/手出しは別の手として数える。
 * 例: "discard:5p" / "discard:5p:riichi" / "discard:5p:tsumogiri" /
 *     "discard:5p:riichi:tsumogiri" / "call:pon:2m" / "call:kan" / "pass"
 * サフィックスは riichi → tsumogiri の順で固定（既存キーは不変）。
 */
export function choiceKey(action: ProblemAction): string {
  if (action.type === "discard") {
    const parts = [`discard:${action.tile}`];
    if (action.riichi) parts.push("riichi");
    if (action.tsumogiri) parts.push("tsumogiri");
    return parts.join(":");
  }
  if (action.type === "call") {
    return action.discard ? `call:${action.call}:${action.discard}` : `call:${action.call}`;
  }
  return "pass";
}

export const PROBLEM_SCHEMA_VERSION = "1.0.0" as const;

/** 出題形式。discard=何切る / call=鳴き判断。 */
export const ProblemKindSchema = z.enum(["discard", "call"]);
export type ProblemKind = z.infer<typeof ProblemKindSchema>;

/** 局情報（手入力の記録のみ。点数の自動計算はしない）。 */
export const ProblemMetaSchema = z.object({
  dealer: SeatSchema.nullable().default(null),
  roundWind: SeatSchema.nullable().default(null),
  honba: z.number().int().min(0).default(0),
  kyotaku: z.number().int().min(0).default(0),
  /** 巡目。 */
  junme: z.number().int().min(1).default(1),
  /** ドラ表示牌（最大5）。 */
  dora: z.array(TileSchema).max(5).default([]),
  note: z.string().default(""),
});
export type ProblemMeta = z.infer<typeof ProblemMetaSchema>;

/** 点数状況（各席の持ち点。手入力の記録のみ・未入力は null）。 */
export const ProblemScoresSchema = z.object({
  east: z.number().int(),
  south: z.number().int(),
  west: z.number().int(),
  north: z.number().int(),
});
export type ProblemScores = z.infer<typeof ProblemScoresSchema>;

/** 副露は種別に関わらず手牌3枚ぶんとして数える（カンの4枚目は嶺上補充で相殺）。 */
const HAND_TILES_PER_MELD = 3;
const FULL_HAND = 13;

export const ProblemSchema = z
  .object({
    schemaVersion: z.literal(PROBLEM_SCHEMA_VERSION),
    kind: ProblemKindSchema,
    /** 出題視点の席（絶対）。この席の手牌が回答者に見える。 */
    pov: SeatSchema,
    /** ツモ牌（kind=discard で必須・call は null）。 */
    drawn: TileSchema.nullable().default(null),
    /** 鳴き判断の対象席。対象牌はこの席の「河の末尾の1枚」（problemTargetTile で導出）。 */
    targetSeat: SeatSchema.nullable().default(null),
    /** 盤面（牌譜と同じ形。pov の hand が手牌、他家は河・副露のみ想定）。 */
    seats: z.object({
      east: SeatBoardSchema,
      south: SeatBoardSchema,
      west: SeatBoardSchema,
      north: SeatBoardSchema,
    }),
    meta: ProblemMetaSchema.default({}),
    /** 点数状況（任意）。 */
    scores: ProblemScoresSchema.nullable().default(null),
    /** 半荘ルール（点数計算の前提と同じ既定＝Mリーグ相当）。 */
    rules: RulesSchema.default({}),
    /** 出題者の解説・コメント（回答後に表示）。正解は設けない（多様な正解を前提に、
     *  回答の分布を見る）。 */
    explanation: z.string().default(""),
  })
  .superRefine((p, ctx) => {
    const board = p.seats[p.pov];
    const handTiles = board.hand.map((t) => t.tile);
    // 視点の手牌は確定牌のみ（AI 非関与。null スロットは編集ミス）。
    if (handTiles.some((t) => t === null)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "手牌に読めない牌は置けない" });
      return;
    }
    // 枚数整合: 手牌＋副露(3枚換算) = 13枚。
    if (board.hand.length + board.melds.length * HAND_TILES_PER_MELD !== FULL_HAND) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `手牌は副露3枚換算で${FULL_HAND}枚にする`,
      });
      return;
    }

    if (p.kind === "discard") {
      if (p.drawn === null) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: "何切るはツモ牌が必須" });
      }
      if (p.targetSeat !== null) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: "何切るに対象席は無い" });
      }
      return;
    }

    // kind === "call"（鳴き判断）
    if (p.drawn !== null) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "鳴き判断にツモ牌は無い" });
    }
    if (p.targetSeat === null || p.targetSeat === p.pov) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "鳴き判断は自分以外の対象席が必須",
      });
      return;
    }
    const river = p.seats[p.targetSeat].river;
    const last = river[river.length - 1];
    if (!last || last.tile === null) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "対象席の河の末尾に対象牌を置く",
      });
    }
  });
export type Problem = z.infer<typeof ProblemSchema>;

/** 鳴き判断の対象牌（対象席の河の末尾の1枚）。discard 問題・河が空なら null。 */
export function problemTargetTile(problem: Problem): Tile | null {
  if (problem.targetSeat === null) return null;
  const river = problem.seats[problem.targetSeat].river;
  return river[river.length - 1]?.tile ?? null;
}

/**
 * 回答者のアクションがこの問題の答えとして成立するか。
 * 出題形式との一致と、切る牌が手牌（何切るはツモ牌も）にあることを確かめる。
 * API が分布（choiceKey）に入れる前のゲートとして使う（不正キーで分布を荒らさない）。
 */
export function isValidAnswer(problem: Problem, action: ProblemAction): boolean {
  const hand = problem.seats[problem.pov].hand.map((t) => t.tile);
  if (problem.kind === "discard") {
    if (action.type !== "discard") return false;
    // ツモ切りはツモ牌と一致する打牌だけ（手牌の牌をツモ切りとは言えない）。
    if (action.tsumogiri) return action.tile === problem.drawn;
    return hand.includes(action.tile) || action.tile === problem.drawn;
  }
  if (action.type === "pass") return true;
  if (action.type !== "call") return false;
  return action.discard === null || hand.includes(action.discard);
}
