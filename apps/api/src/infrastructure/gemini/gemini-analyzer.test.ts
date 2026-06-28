import type { CameraSeat } from "@rigel/schema";
import { describe, expect, it } from "vitest";
import type { AnalysisInput, ImageRef } from "../../domain/kifu/analyzer";
import { GeminiAnalyzer } from "./gemini-analyzer";
import type { GeminiClient } from "./gemini-client";
import type { RiverPreprocessor } from "./river-preprocessor";

const img = (tag: string): ImageRef => ({ data: new ArrayBuffer(0), mimeType: tag });

// 各方向で1枚だけ捨てた河を返すフェイク前処理。
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

// 呼ばれるたびに有効な河 JSON を返すフェイク Gemini。
class FakeClient implements GeminiClient {
  calls = 0;
  generateText(): Promise<string> {
    this.calls += 1;
    return Promise.resolve('{"discards":[{"order":1,"tile":"1m"}],"notes":""}');
  }
}

const input: AnalysisInput = {
  riverImage: img("river"),
  cameraBottomSeat: "east",
};

describe("GeminiAnalyzer.analyze", () => {
  it("4方向を読み、検証済みの Kifu を組み立てる", async () => {
    const client = new FakeClient();
    const analyzer = new GeminiAnalyzer({
      client,
      preprocessor: new FakePreprocessor(),
      riverPrompt: "p",
      riverModel: "m",
      now: () => new Date("2026-06-28T00:00:00.000Z"),
    });

    const kifu = await analyzer.analyze(input);

    expect(client.calls).toBe(4); // 4方向ぶん呼ぶ
    expect(kifu.schemaVersion).toBe("1.0.0");
    expect(kifu.cameraBottomSeat).toBe("east");
    // bottom=手前=東 に河が入る（回転方向に依存しない不変条件）
    expect(kifu.seats.east.river[0]?.tile).toBe("1m");
  });

  it("前処理が未実装なら失敗を伝播する", async () => {
    const failing: RiverPreprocessor = {
      split: () => Promise.reject(new Error("not implemented")),
    };
    const analyzer = new GeminiAnalyzer({
      client: new FakeClient(),
      preprocessor: failing,
      riverPrompt: "p",
      riverModel: "m",
      now: () => new Date("2026-06-28T00:00:00.000Z"),
    });
    await expect(analyzer.analyze(input)).rejects.toThrow("not implemented");
  });
});
