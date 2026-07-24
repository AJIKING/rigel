// ============================================================
// eval — 正解ラベル（truth.json）の記法とドラフト整形
// ------------------------------------------------------------
// 人間が書きやすいトークン記法（"5s" / "*5s"=リーチ横向き / "?"=判別不能）と、
// eval-fixtures/cases/<case>/truth.json の検証・展開を提供する。
// AI 応答 → トークンへの逆変換（formatRiverTokens / formatHandDraft）は
// 「Gemini のドラフトを人が直して正解に昇格する」ワークフローの足場。
// ============================================================

import {
  CameraSeatSchema,
  MeldTypeSchema,
  TileSchema,
  type AiHandResponse,
  type AiRiverResponse,
  type CameraSeat,
  type MeldType,
  type Tile,
} from "@rigel/schema";
import { z } from "zod";

/** 正解ラベルの牌1枚。riichi は河トークンのみ意味を持つ（手牌では常に false）。 */
export interface TruthTile {
  tile: Tile | null;
  riichi: boolean;
}

const UNKNOWN_TOKEN = "?";

/** "5s" / "*5s" / "?" / "*?" → TruthTile。不正な牌コードは理由つきで投げる。 */
export function parseTileToken(token: string): TruthTile {
  const riichi = token.startsWith("*");
  const body = riichi ? token.slice(1) : token;
  if (body === UNKNOWN_TOKEN) return { tile: null, riichi };
  const parsed = TileSchema.safeParse(body);
  if (!parsed.success) {
    throw new Error(`不正な牌トークン: "${token}"（1m-9m/1p-9p/1s-9s/1z-7z/0m,0p,0s/? のみ）`);
  }
  return { tile: parsed.data, riichi };
}

function tokenToString(t: { tile: Tile | null; riichi?: boolean }): string {
  const body = t.tile ?? UNKNOWN_TOKEN;
  return t.riichi ? `*${body}` : body;
}

// ------------------------------------------------------------
// truth.json のスキーマ（トークンは transform で展開する）
// ------------------------------------------------------------
const TokenSchema = z.string().transform((s, ctx) => {
  try {
    return parseTileToken(s);
  } catch (e) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: (e as Error).message });
    return z.NEVER;
  }
});

const RiverTargetSchema = z.object({
  kind: z.literal("river"),
  player: CameraSeatSchema,
  /** case ディレクトリからの相対パス。省略時は resolveTargetImage の規約。 */
  image: z.string().optional(),
  discards: z.array(TokenSchema),
});

const HandTargetSchema = z.object({
  kind: z.literal("hand"),
  player: CameraSeatSchema,
  image: z.string().optional(),
  hand: z.array(TokenSchema),
  melds: z
    .array(
      z.object({
        type: MeldTypeSchema,
        tiles: z.array(TokenSchema).min(3).max(4),
        from: CameraSeatSchema.nullable(),
      }),
    )
    .default([]),
});

const TruthFileSchema = z.object({
  source: z.string().optional(),
  targets: z.array(z.discriminatedUnion("kind", [RiverTargetSchema, HandTargetSchema])),
});

export type TruthTarget = z.infer<typeof TruthFileSchema>["targets"][number];
export type TruthRiverTarget = Extract<TruthTarget, { kind: "river" }>;
export type TruthHandTarget = Extract<TruthTarget, { kind: "hand" }>;
export type TruthFile = z.infer<typeof TruthFileSchema>;

export function parseTruthFile(raw: unknown): TruthFile {
  return TruthFileSchema.parse(raw);
}

/** ターゲットが読む画像（case ディレクトリ相対）。単一なら source.png、複数なら crops/<player>.png。 */
export function resolveTargetImage(file: TruthFile, target: TruthTarget): string {
  if (target.image) return target.image;
  return file.targets.length === 1 ? "source.png" : `crops/${target.player}.png`;
}

// ------------------------------------------------------------
// AI 応答 → ドラフトトークン（人が直して truth.json に貼る）
// ------------------------------------------------------------
export function formatRiverTokens(res: AiRiverResponse): string[] {
  return [...res.discards]
    .sort((a, b) => a.order - b.order)
    .map((d) => tokenToString({ tile: d.tile, riichi: d.riichi }));
}

export interface HandDraft {
  hand: string[];
  melds: { type: MeldType; tiles: string[]; from: CameraSeat | null }[];
}

export function formatHandDraft(res: AiHandResponse): HandDraft {
  return {
    hand: res.hand.map((t) => tokenToString({ tile: t.tile })),
    melds: res.melds.map((m) => ({
      type: m.type,
      tiles: m.tiles.map((t) => tokenToString({ tile: t.tile })),
      from: m.from,
    })),
  };
}
