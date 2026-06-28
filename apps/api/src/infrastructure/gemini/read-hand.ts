// infrastructure/gemini — 手牌1人分の読み取り（Gemini → JSON抽出 → Zod検証）。
// 正立済みの手牌画像 + プロンプト → 検証済み AiHandResponse（鳴き元はカメラ相対）。

import { AiHandResponseSchema, type AiHandResponse } from "@rigel/schema";
import type { ImageRef } from "../../domain/kifu/analyzer";
import { extractJson } from "./extract-json";
import type { GeminiClient } from "./gemini-client";

export interface ReadHandDeps {
  client: GeminiClient;
  prompt: string;
  model: string;
}

export async function readHand(deps: ReadHandDeps, image: ImageRef): Promise<AiHandResponse> {
  const text = await deps.client.generateText({
    model: deps.model,
    prompt: deps.prompt,
    images: [image],
  });
  return AiHandResponseSchema.parse(extractJson(text));
}
