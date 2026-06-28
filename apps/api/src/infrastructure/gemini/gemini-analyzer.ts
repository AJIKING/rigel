// infrastructure/gemini — Analyzer の実体（Gemini + AI Gateway）。
// パイプライン: 河1枚を4分割＋正立(preprocessor) → 各方向を Gemini で読む(read-river)
//             → カメラ相対→絶対で Kifu を組み立てる(assemble)。
// モデル名はハードコードせず注入する。手牌読み取りは M5b（assemble は手牌任意対応済み）。

import { CameraSeatSchema, type AiRiverResponse, type CameraSeat, type Kifu } from "@rigel/schema";
import type { AnalysisInput, Analyzer } from "../../domain/kifu/analyzer";
import { assembleKifu } from "./assemble";
import type { GeminiClient } from "./gemini-client";
import { readRiverDirection } from "./read-river";
import type { RiverPreprocessor } from "./river-preprocessor";

export interface GeminiAnalyzerDeps {
  client: GeminiClient;
  preprocessor: RiverPreprocessor;
  riverPrompt: string;
  riverModel: string;
  now: () => Date;
}

export class GeminiAnalyzer implements Analyzer {
  constructor(private readonly deps: GeminiAnalyzerDeps) {}

  async analyze(input: AnalysisInput): Promise<Kifu> {
    const { client, preprocessor, riverPrompt, riverModel, now } = this.deps;

    // 河1枚 → 4方向の正立画像。
    const directionImages = await preprocessor.split(input.riverImage);

    // 各方向を並列に読む（それぞれ Zod 検証済みの AiRiverResponse）。
    const riverDeps = { client, prompt: riverPrompt, model: riverModel };
    const entries = await Promise.all(
      CameraSeatSchema.options.map(
        async (cam) => [cam, await readRiverDirection(riverDeps, directionImages[cam])] as const,
      ),
    );
    const rivers = Object.fromEntries(entries) as Record<CameraSeat, AiRiverResponse>;

    return assembleKifu({
      rivers,
      cameraBottomSeat: input.cameraBottomSeat,
      capturedAt: now().toISOString(),
    });
  }
}
