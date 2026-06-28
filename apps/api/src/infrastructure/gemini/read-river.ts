// infrastructure/gemini — 河1方向の読み取り（Gemini → JSON抽出 → Zod検証）。
// 1方向の正立画像 + プロンプト → 検証済み AiRiverResponse。

import { AiRiverResponseSchema, type AiRiverResponse } from "@rigel/schema";
import type { ImageRef } from "../../domain/kifu/analyzer";
import { extractJson } from "./extract-json";
import type { GeminiClient } from "./gemini-client";

export interface ReadRiverDeps {
  client: GeminiClient;
  prompt: string;
  model: string;
}

export async function readRiverDirection(
  deps: ReadRiverDeps,
  image: ImageRef,
): Promise<AiRiverResponse> {
  const text = await deps.client.generateText({
    model: deps.model,
    prompt: deps.prompt,
    images: [image],
  });
  // 使う前に必ず Zod 検証（信頼ゲート）。不正な牌コード等はここで弾く。
  return AiRiverResponseSchema.parse(extractJson(text));
}
