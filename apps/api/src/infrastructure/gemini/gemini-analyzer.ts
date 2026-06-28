// infrastructure/gemini — Analyzer の実体（Gemini + AI Gateway）。
// パイプライン: 河1枚を4分割＋正立(preprocessor) → 各方向を Gemini で読む(read-river)
//             → 手牌（あれば）を読む(read-hand) → カメラ相対→絶対で Kifu を組み立てる(assemble)。
// モデル名はハードコードせず注入する。

import {
  CameraSeatSchema,
  type AiHandResponse,
  type AiRiverResponse,
  type CameraSeat,
  type Kifu,
} from "@rigel/schema";
import type { AnalysisInput, Analyzer, ImageRef } from "../../domain/kifu/analyzer";
import { assembleKifu } from "./assemble";
import type { GeminiClient } from "./gemini-client";
import { readHand } from "./read-hand";
import { readRiverDirection } from "./read-river";
import type { RiverPreprocessor } from "./river-preprocessor";

export interface GeminiAnalyzerDeps {
  client: GeminiClient;
  preprocessor: RiverPreprocessor;
  riverPrompt: string;
  riverModel: string;
  handPrompt: string;
  handModel: string;
  now: () => Date;
}

export class GeminiAnalyzer implements Analyzer {
  constructor(private readonly deps: GeminiAnalyzerDeps) {}

  async analyze(input: AnalysisInput): Promise<Kifu> {
    const { client, preprocessor, riverPrompt, riverModel, handPrompt, handModel, now } = this.deps;

    // 河1枚 → 4方向の正立画像 → 各方向を並列に読む（Zod 検証済み）。
    const directionImages = await preprocessor.split(input.riverImage);
    const riverDeps = { client, prompt: riverPrompt, model: riverModel };
    const riverEntries = await Promise.all(
      CameraSeatSchema.options.map(
        async (cam) => [cam, await readRiverDirection(riverDeps, directionImages[cam])] as const,
      ),
    );
    const rivers = Object.fromEntries(riverEntries) as Record<CameraSeat, AiRiverResponse>;

    // 手牌（提供された方向だけ）を並列に読む。撮影時点で正立なので前処理は不要。
    const handDeps = { client, prompt: handPrompt, model: handModel };
    const handImages = Object.entries(input.hands ?? {}).filter(
      (entry): entry is [CameraSeat, ImageRef] => entry[1] !== undefined,
    );
    const handEntries = await Promise.all(
      handImages.map(async ([cam, image]) => [cam, await readHand(handDeps, image)] as const),
    );
    const hands = Object.fromEntries(handEntries) as Partial<Record<CameraSeat, AiHandResponse>>;

    return assembleKifu({
      rivers,
      hands,
      cameraBottomSeat: input.cameraBottomSeat,
      capturedAt: now().toISOString(),
    });
  }
}
