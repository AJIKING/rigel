import { describe, expect, it } from "vitest";
import type { GeminiClient } from "./gemini-client";
import { readHand } from "./read-hand";

const image = { data: new ArrayBuffer(0), mimeType: "image/jpeg" };

function clientReturning(text: string): GeminiClient {
  return { generateText: () => Promise.resolve(text) };
}

describe("readHand", () => {
  it("手牌と鳴き(カメラ相対のfrom)を検証して返す", async () => {
    const client = clientReturning(
      '{"hand":[{"tile":"1m","confidence":0.9},{"tile":null,"confidence":0}],"melds":[{"type":"pon","tiles":[{"tile":"5z","confidence":0.9}],"from":"left"}],"notes":""}',
    );
    const result = await readHand({ client, prompt: "p", model: "m" }, image);
    expect(result.hand).toHaveLength(2);
    expect(result.hand[1]?.tile).toBeNull();
    expect(result.melds[0]?.from).toBe("left");
  });

  it("不正な鳴き種別は Zod 検証で弾く", async () => {
    const client = clientReturning(
      '{"hand":[],"melds":[{"type":"nuki","tiles":[],"from":null}],"notes":""}',
    );
    await expect(readHand({ client, prompt: "p", model: "m" }, image)).rejects.toThrow();
  });
});
