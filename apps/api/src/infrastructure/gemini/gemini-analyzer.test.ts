import type { CameraSeat } from "@rigel/schema";
import { describe, expect, it } from "vitest";
import type { AnalysisInput, ImageRef } from "../../domain/kifu/analyzer";
import { GeminiAnalyzer, type GeminiAnalyzerDeps } from "./gemini-analyzer";
import type { GenerateParams, GeminiClient } from "./gemini-client";
import type { RiverPreprocessor } from "./river-preprocessor";

const img = (tag: string): ImageRef => ({ data: new ArrayBuffer(0), mimeType: tag });

const RIVER_PROMPT = "RIVER";
const HAND_PROMPT = "HAND";
const RIVER_JSON = '{"discards":[{"order":1,"tile":"1m"}],"notes":""}';
const HAND_JSON = '{"hand":[{"tile":"2p","confidence":0.9}],"melds":[],"notes":""}';

class FakePreprocessor implements RiverPreprocessor {
  split(_river: ImageRef): Promise<Record<CameraSeat, ImageRef>> {
    return Promise.resolve({
      bottom: img("bottom"),
      right: img("right"),
      top: img("top"),
      left: img("left"),
    });
  }
}

// プロンプトで河/手牌を判別して返すフェイク。
class FakeClient implements GeminiClient {
  riverCalls = 0;
  handCalls = 0;
  generateText(params: GenerateParams): Promise<string> {
    if (params.prompt === HAND_PROMPT) {
      this.handCalls += 1;
      return Promise.resolve(HAND_JSON);
    }
    this.riverCalls += 1;
    return Promise.resolve(RIVER_JSON);
  }
}

function makeDeps(client: GeminiClient, preprocessor: RiverPreprocessor): GeminiAnalyzerDeps {
  return {
    client,
    preprocessor,
    riverPrompt: RIVER_PROMPT,
    riverModel: "river-model",
    handPrompt: HAND_PROMPT,
    handModel: "hand-model",
    now: () => new Date("2026-06-28T00:00:00.000Z"),
  };
}

describe("GeminiAnalyzer.analyze", () => {
  it("4方向の河を読み、検証済みの Kifu を組み立てる", async () => {
    const client = new FakeClient();
    const analyzer = new GeminiAnalyzer(makeDeps(client, new FakePreprocessor()));

    const kifu = await analyzer.analyze({ riverImage: img("river"), cameraBottomSeat: "east" });

    expect(client.riverCalls).toBe(4);
    expect(kifu.schemaVersion).toBe("1.0.0");
    // bottom=手前=東 に河が入る（回転方向に依存しない不変条件）
    expect(kifu.seats.east.river[0]?.tile).toBe("1m");
  });

  it("手牌が提供された方向だけ読み、その席の手牌に入る", async () => {
    const client = new FakeClient();
    const analyzer = new GeminiAnalyzer(makeDeps(client, new FakePreprocessor()));

    const input: AnalysisInput = {
      riverImage: img("river"),
      hands: { bottom: img("hand-bottom") },
      cameraBottomSeat: "east",
    };
    const kifu = await analyzer.analyze(input);

    expect(client.handCalls).toBe(1); // 提供された1方向だけ
    expect(kifu.seats.east.hand[0]?.tile).toBe("2p"); // bottom=東
  });

  it("前処理が失敗したら伝播する", async () => {
    const failing: RiverPreprocessor = {
      split: () => Promise.reject(new Error("preprocess failed")),
    };
    const analyzer = new GeminiAnalyzer(makeDeps(new FakeClient(), failing));
    await expect(
      analyzer.analyze({ riverImage: img("river"), cameraBottomSeat: "east" }),
    ).rejects.toThrow("preprocess failed");
  });
});
