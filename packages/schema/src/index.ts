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

/** 牌1枚。手牌・鳴き・河の最小単位。
 *  読めなかった牌は tile: null（これが唯一の不確実性シグナル。
 *  数値 confidence は[決定] 2026-07-24 で廃止 — モデルの自己申告数値は較正が保証できず、
 *  AI 出力は常に「目検必須のドラフト」として扱う）。 */
export const ReadTileSchema = z.object({
  tile: MaybeTileSchema,
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
  /** この捨て牌を鳴いた席（ポン/チー/カンで持っていかれた）。null=鳴かれていない。
   *  牌は河に残して印を付ける表現（[決定] 2026-07-13。巡目・打牌順を保つ。表示は薄く）。 */
  calledBy: SeatSchema.nullable().default(null),
});
export type Discard = z.infer<typeof DiscardSchema>;

// ------------------------------------------------------------
// 1席ぶんの盤面
// ------------------------------------------------------------
/**
 * 牌譜の「量」の上限。麻雀としてありえない量を弾くデータ品質のゲートであり、
 * 同時に乱用耐性でもある（保存 JSON が無制限だと D1 が肥大し、公開フィードの
 * 読み取りコストが保存内容に比例して膨らむ）。schema は全層（api/web/mobile）が
 * 共有するため、ここに置けば入口がすべて塞がる。
 */
export const KIFU_LIMITS = {
  /** 手牌（13枚＋ツモ牌）。 */
  hand: 14,
  /** 副露（最大4＋余裕）。 */
  melds: 5,
  /** 河（実戦の最大打牌数 ~24 に余裕）。 */
  river: 30,
  /** 手順イベント（4人×最大巡目に余裕）。 */
  timeline: 200,
  /** 和了1件の役の数。 */
  yaku: 20,
  /** 役名の文字数。 */
  yakuName: 20,
  /** 読み取りメモ・局メモの文字数。 */
  readingNotes: 2000,
  note: 500,
  /** 何切るの解説の文字数。 */
  explanation: 2000,
  /** 表示名（プロフィール）の文字数。 */
  displayName: 30,
} as const;

export const SeatBoardSchema = z.object({
  hand: z.array(ReadTileSchema).max(KIFU_LIMITS.hand).default([]),
  melds: z.array(MeldSchema).max(KIFU_LIMITS.melds).default([]),
  river: z.array(DiscardSchema).max(KIFU_LIMITS.river).default([]),
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
  /** この捨て牌を鳴いた席（Discard.calledBy と同義。河と手順の往復で保つ）。 */
  calledBy: SeatSchema.nullable().default(null),
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
  name: z.string().max(KIFU_LIMITS.yakuName),
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
  yaku: z.array(YakuSchema).max(KIFU_LIMITS.yaku).default([]),
  /** 符。 */
  fu: z.number().int().min(0).default(0),
  /** 表ドラの枚数（1枚1飜）。 */
  dora: z.number().int().min(0).default(0),
  /** 赤ドラの枚数（1枚1飜）。 */
  aka: z.number().int().min(0).default(0),
  /** 裏ドラの枚数（リーチ和了のみ・1枚1飜）。 */
  ura: z.number().int().min(0).default(0),
  /** リーチ宣言した席。 */
  riichi: z.array(SeatSchema).max(4).default([]),
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
      note: z.string().max(KIFU_LIMITS.note).default(""),
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
  tenpai: z.array(SeatSchema).max(4).default([]),

  /** 解析時の読み取り困難メモ（グレア・ブレ・見切れ等）。AIのnotesを引き継ぐ。 */
  readingNotes: z.string().max(KIFU_LIMITS.readingNotes).default(""),

  /** 手順（タイムライン）。打牌・鳴きの全席横断の時系列。省略時は空（後方互換）。
   *  盤面/巡目はここから導出する正典（設計: docs/designs/timeline-editor.md）。 */
  timeline: z.array(TimelineEventSchema).max(KIFU_LIMITS.timeline).default([]),
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

/**
 * AI 出力の牌。読めない・迷う牌は tile: null（推測で埋めさせない）。
 * 数値 confidence は廃止（[決定] 2026-07-24）: Gemini に自己申告させた数値であり
 * 較正が保証できないため、UI は「AI ドラフトは全牌目検必須」を前提にする。
 */
export const AiReadTileSchema = z.object({
  tile: MaybeTileSchema,
});

export const AiDiscardSchema = z.object({
  order: z.number().int().positive(),
  tile: MaybeTileSchema,
  riichi: z.boolean().default(false),
  tsumogiri: z.boolean().default(false),
});

/** 河1方向ぶんのAI出力（river_reader_prompt.md の1方向版に対応）。
 *  モデルが暴走・汚染されても Kifu と同じ「量」の上限で弾く。 */
export const AiRiverResponseSchema = z.object({
  discards: z.array(AiDiscardSchema).max(KIFU_LIMITS.river),
  // notes: null を返すモデルが実在する（gemini-3.6-flash・2026-07-24 eval）。1フィールドで
  // 応答全体を落とさず "" に倒す。
  notes: z
    .string()
    .max(KIFU_LIMITS.readingNotes)
    .nullish()
    .transform((v) => v ?? ""),
});
export type AiRiverResponse = z.infer<typeof AiRiverResponseSchema>;

/** 手牌1人ぶんのAI出力。鳴き元もカメラ相対で出させ、変換時に絶対へ。 */
export const AiHandResponseSchema = z.object({
  hand: z.array(AiReadTileSchema).max(KIFU_LIMITS.hand),
  melds: z
    .array(
      z.object({
        type: MeldTypeSchema,
        tiles: z.array(AiReadTileSchema).max(4),
        from: CameraSeatSchema.nullable(),
      }),
    )
    .max(KIFU_LIMITS.melds)
    .default([]),
  notes: z
    .string()
    .max(KIFU_LIMITS.readingNotes)
    .nullish()
    .transform((v) => v ?? ""),
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

/** 局順(seq: 東一局=1〜北四局=16)から親の席を導出する（起家=east から下家順の4局周期）。
 *  局の作成（api）と局順の変更（編集画面）で同じ導出を共有する。 */
export function dealerForSeq(seq: number): Seat {
  return SEAT_ORDER[(Math.max(1, seq) - 1) % 4]!;
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
  /** チーの構成（鳴いた牌を含む順子3枚。567/678/789 のような鳴き方の違いを区別する）。
   *  チー以外は null。旧回答（構成なし）も null（後方互換）。 */
  chiTiles: z.array(TileSchema).length(3).nullable().default(null),
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
    if (action.call !== "chi" && action.chiTiles !== null) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "構成(chiTiles)はチーのみ" });
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
    const parts = [`call:${action.call}`];
    // チーの構成（例 "345p"）。構成が違えば別の手として数える。旧回答（null）はキー不変。
    if (action.call === "chi" && action.chiTiles) parts.push(chiRunKey(action.chiTiles));
    if (action.discard) parts.push(action.discard);
    return parts.join(":");
  }
  return "pass";
}

/** 赤5（0x）を通常の5に正規化した牌コード。構成キー・手牌照合・表示の同一視に使う。 */
export function normalizeRed(tile: Tile): Tile {
  return tile[0] === "0" ? (`5${tile[1]}` as Tile) : tile;
}

/** チー構成の集計キー（例 "345p"。数字昇順・赤5は5に正規化＝赤の有無で分布を割らない）。 */
function chiRunKey(tiles: Tile[]): string {
  const digits = tiles
    .map((t) => normalizeRed(t)[0]!)
    .sort()
    .join("");
  return `${digits}${tiles[0]![1]!}`;
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
    explanation: z.string().max(KIFU_LIMITS.explanation).default(""),
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

// ============================================================
// 特訓クイズ（60秒タイムアタック）の結果
// ------------------------------------------------------------
// AI 非関与・クライアント採点。サーバは QuizResultSchema を通った結果だけを
// 記録する（Plan: docs/plans/quiz-training.md）。上限は「量」の防御
//（乱用でグラフ・D1 を荒らさせない）。
// ============================================================

/** クイズ種別。chinitsu=清一色多面待ち / efficiency=牌効率 /
 *  score=点数計算（牌姿から点数を選ぶ。[決定] 2026-07-26 追加）/
 *  chinitsuUkeire=清一色 何切る（単色14枚から一番広くなる1枚を切る。[決定] 2026-07-26 追加。
 *    テンパイ手は待ち枚数・1向聴手は受け入れ枚数が最大の打牌が正解。
 *    単色14枚に2向聴は存在しない（全118,800通りの総当たりで確認）ので出題は0/1向聴のみ。
 *    Plan: docs/plans/quiz-chinitsu-ukeire.md）。
 *  D1 の kind は text 列なので、種別追加にマイグレーションは要らない。 */
export const QuizKindSchema = z.enum(["chinitsu", "efficiency", "score", "chinitsuUkeire"]);
export type QuizKind = z.infer<typeof QuizKindSchema>;

/** 60秒セッション1回の結果（クライアント採点をサーバに記録する形）。 */
export const QuizResultSchema = z
  .object({
    kind: QuizKindSchema,
    /** 出題数（回答した数）。 */
    total: z.number().int().min(0).max(100),
    /** 正解数（total 以下）。 */
    correct: z.number().int().min(0),
    /** 所要ミリ秒（60秒+余裕。上限 120000）。 */
    durationMs: z.number().int().min(0).max(120_000),
  })
  .refine((r) => r.correct <= r.total, { message: "correct は total 以下" });
export type QuizResult = z.infer<typeof QuizResultSchema>;

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
  // チーの構成: 対象牌（河末尾）を含む順子で、残り2枚を手牌から出せること（赤5は同一視）。
  // （undefined も許容＝未 parse の旧型アクションを壊さない。API は parse 済みを渡す契約）
  if (action.call === "chi" && action.chiTiles != null) {
    const target = problemTargetTile(problem);
    if (target === null) return false;
    const suit = target[1];
    if (suit === "z" || action.chiTiles.some((t) => t[1] !== suit)) return false;
    const nums = action.chiTiles.map((t) => Number(normalizeRed(t)[0])).sort((a, b) => a - b);
    if (nums[1] !== nums[0]! + 1 || nums[2] !== nums[1]! + 1) return false;
    const rest = [...action.chiTiles];
    const ti = rest.findIndex((t) => normalizeRed(t) === normalizeRed(target));
    if (ti < 0) return false;
    rest.splice(ti, 1);
    const pool = hand.flatMap((t) => (t === null ? [] : [normalizeRed(t)]));
    for (const t of rest) {
      const i = pool.indexOf(normalizeRed(t));
      if (i < 0) return false;
      pool.splice(i, 1);
    }
  }
  return action.discard === null || hand.includes(action.discard);
}

// ============================================================
// プラン上限ポリシー（課金・保存上限の単一真実源）
// ============================================================

export * from "./plan";

// ============================================================
// JST 日付ヘルパ（api の無料枠キーと ui の日毎集計が共有）
// ============================================================

export * from "./jst";
