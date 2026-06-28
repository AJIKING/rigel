import { describe, expect, it } from "vitest";
import { fakeImage } from "../../test-support/image";
import type { GeminiClient } from "./gemini-client";
import { readRiverDirection } from "./read-river";

const image = fakeImage();

function clientReturning(text: string): GeminiClient {
  return { generateText: () => Promise.resolve(text) };
}

describe("readRiverDirection", () => {
  it("Gemini のテキストを JSON 抽出し AiRiverResponse に検証する", async () => {
    const client = clientReturning(
      '```json\n{"discards":[{"order":1,"tile":"9p","riichi":false,"confidence":0.9},{"order":2,"tile":null,"confidence":0}],"notes":"glare"}\n```',
    );
    const result = await readRiverDirection({ client, prompt: "p", model: "m" }, image);
    expect(result.discards).toHaveLength(2);
    expect(result.discards[1]?.tile).toBeNull(); // 読めない牌は null スロット保持
    expect(result.notes).toBe("glare");
  });

  it("不正な牌コードは Zod 検証で弾く", async () => {
    const client = clientReturning('{"discards":[{"order":1,"tile":"10m"}],"notes":""}');
    await expect(readRiverDirection({ client, prompt: "p", model: "m" }, image)).rejects.toThrow();
  });
});
