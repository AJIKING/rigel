import { describe, expect, it } from "vitest";
import { HttpGeminiClient } from "./gemini-client";

function geminiResponse(parts: unknown[]) {
  return { candidates: [{ content: { parts } }] };
}

describe("HttpGeminiClient", () => {
  it("テキストパートだけを連結し、コード実行パートは無視する", async () => {
    let capturedUrl = "";
    const fetchImpl = (async (url: string) => {
      capturedUrl = String(url);
      return new Response(
        JSON.stringify(
          geminiResponse([
            { text: "I will crop and read.\n" },
            { executableCode: { language: "PYTHON", code: "crop(img)" } },
            { codeExecutionResult: { outcome: "OK", output: "done" } },
            { text: '{"discards":[],"notes":""}' },
          ]),
        ),
        { status: 200 },
      );
    }) as unknown as typeof fetch;

    const client = new HttpGeminiClient({
      apiKey: "key",
      baseUrl: "https://gw.example/google-ai-studio",
      fetchImpl,
    });

    const text = await client.generateText({ model: "m1", prompt: "read", images: [] });

    expect(text).toContain('{"discards":[]');
    expect(text).not.toContain("crop("); // コード実行パートは混ざらない
    expect(capturedUrl).toContain("/v1beta/models/m1:generateContent");
  });

  it("非200応答はエラーにする", async () => {
    const fetchImpl = (async () =>
      new Response("nope", { status: 500 })) as unknown as typeof fetch;
    const client = new HttpGeminiClient({ apiKey: "k", baseUrl: "https://gw.example", fetchImpl });
    await expect(client.generateText({ model: "m", prompt: "p", images: [] })).rejects.toThrow(
      /500/,
    );
  });
});
