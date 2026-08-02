// infrastructure/gemini — Analyzer の実体（Gemini + AI Gateway）。
// パイプライン: 河1枚を4分割＋正立(preprocessor) → 各方向を Gemini で読む(read-river)
//             → 手牌（あれば）を読む(read-hand) → カメラ相対→絶対で Kifu を組み立てる(assemble)。
// モデル名はハードコードせず注入する。

import {
  CameraSeatSchema,
  type AiHandResponse,
  type AiRiverResponse,
  type CameraSeat,
} from "@rigel/schema";
import type { AnalysisInput, AnalysisResult, Analyzer, ImageRef } from "../../domain/kifu/analyzer";
import { assembleKifu } from "./assemble";
import type { GeminiClient } from "./gemini-client";
import type { HandFromTablePreprocessor } from "./image-hand-preprocessor";
import { readHand } from "./read-hand";
import { readRiverDirection } from "./read-river";
import type { RiverPreprocessor } from "./river-preprocessor";

export interface GeminiAnalyzerDeps {
  client: GeminiClient;
  preprocessor: RiverPreprocessor;
  /** 1枚モード（河写真の下端帯 → 手前の手牌。docs/plans/one-shot-hand.md）。 */
  handPreprocessor: HandFromTablePreprocessor;
  riverPrompt: string;
  riverModel: string;
  handPrompt: string;
  /** 1枚モード用の手牌プロンプト（卓写真の下端帯から手牌の一列だけを読む）。 */
  handTablePrompt: string;
  handModel: string;
  now: () => Date;
}

export class GeminiAnalyzer implements Analyzer {
  constructor(private readonly deps: GeminiAnalyzerDeps) {}

  async analyze(input: AnalysisInput): Promise<AnalysisResult> {
    const {
      client,
      preprocessor,
      handPreprocessor,
      riverPrompt,
      riverModel,
      handPrompt,
      handTablePrompt,
      handModel,
      now,
    } = this.deps;

    // 河1枚 → 4方向の正立画像 → 各方向を並列に読む（Zod 検証済み）。
    // 河なし（何切る用: 手牌のみ）は読み取りをスキップし、空の河にする（推測しない）。
    let riverCalls = 0;
    const emptyRiver = (): AiRiverResponse => ({ discards: [], notes: "" });
    let rivers = Object.fromEntries(
      CameraSeatSchema.options.map((cam) => [cam, emptyRiver()]),
    ) as Record<CameraSeat, AiRiverResponse>;
    if (input.riverImage) {
      const directionImages = await preprocessor.split(input.riverImage);
      const riverDeps = { client, prompt: riverPrompt, model: riverModel };
      const riverEntries = await Promise.all(
        CameraSeatSchema.options.map(
          async (cam) => [cam, await readRiverDirection(riverDeps, directionImages[cam])] as const,
        ),
      );
      rivers = Object.fromEntries(riverEntries) as Record<CameraSeat, AiRiverResponse>;
      riverCalls = riverEntries.length;
    }

    // 手牌（提供された方向だけ）を並列に読む。撮影時点で正立なので前処理は不要。
    const handDeps = { client, prompt: handPrompt, model: handModel };
    const handImages = Object.entries(input.hands ?? {}).filter(
      (entry): entry is [CameraSeat, ImageRef] => entry[1] !== undefined,
    );
    const handEntries = await Promise.all(
      handImages.map(async ([cam, image]) => [cam, await readHand(handDeps, image)] as const),
    );
    const hands = Object.fromEntries(handEntries) as Partial<Record<CameraSeat, AiHandResponse>>;

    // 1枚モード: 河写真の四辺の帯から四家の手牌も読む（専用プロンプト・呼び出し 最大+4）。
    // 対局終了時に全員が手牌を開けて撮るケース。伏せ牌しか写っていない辺はプロンプトが
    // 空の手牌を返す。明示の手牌写真がある方向はそちら（寄り写真の方が精度が高い）を優先。
    let tableHandCalls = 0;
    if (input.handFromRiver && input.riverImage) {
      const bands = await handPreprocessor.cropHands(input.riverImage);
      const tableDeps = { client, prompt: handTablePrompt, model: handModel };
      const bandEntries = await Promise.all(
        CameraSeatSchema.options
          .filter((cam) => !hands[cam])
          .map(async (cam) => [cam, await readHand(tableDeps, bands[cam])] as const),
      );
      for (const [cam, response] of bandEntries) hands[cam] = response;
      tableHandCalls = bandEntries.length;
    }

    const kifu = assembleKifu({
      rivers,
      hands,
      cameraBottomSeat: input.cameraBottomSeat,
      capturedAt: now().toISOString(),
    });

    // 河は読んだ方向ぶん（無ければ0）、手牌は提供された枚数＋1枚モードぶん呼び出す。
    const geminiCalls = riverCalls + handEntries.length + tableHandCalls;
    return { kifu, geminiCalls };
  }
}
