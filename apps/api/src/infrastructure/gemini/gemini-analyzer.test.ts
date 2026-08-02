import type { CameraSeat } from "@rigel/schema";
import { describe, expect, it } from "vitest";
import type { AnalysisInput, ImageRef } from "../../domain/kifu/analyzer";
import { fakeImage as img } from "../../test-support/image";
import { GeminiAnalyzer, type GeminiAnalyzerDeps } from "./gemini-analyzer";
import type { GenerateParams, GeminiClient } from "./gemini-client";
import type { RiverPreprocessor } from "./river-preprocessor";

const RIVER_PROMPT = "RIVER";
const HAND_PROMPT = "HAND";
const TABLE_HAND_PROMPT = "TABLE_HAND";
const RIVER_JSON = '{"discards":[{"order":1,"tile":"1m"}],"notes":""}';
const HAND_JSON = '{"hand":[{"tile":"2p"}],"melds":[],"notes":""}';
const TABLE_HAND_JSON = '{"hand":[{"tile":"3s"}],"melds":[],"notes":""}';

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

// プロンプトで河/手牌/1枚モード手牌を判別して返すフェイク。
class FakeClient implements GeminiClient {
  riverCalls = 0;
  handCalls = 0;
  tableHandCalls = 0;
  generateText(params: GenerateParams): Promise<string> {
    if (params.prompt === TABLE_HAND_PROMPT) {
      this.tableHandCalls += 1;
      return Promise.resolve(TABLE_HAND_JSON);
    }
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
    handPreprocessor: {
      cropHands: () =>
        Promise.resolve({
          bottom: img("hand-band-bottom"),
          right: img("hand-band-right"),
          top: img("hand-band-top"),
          left: img("hand-band-left"),
        }),
    },
    riverPrompt: RIVER_PROMPT,
    riverModel: "river-model",
    handPrompt: HAND_PROMPT,
    handTablePrompt: TABLE_HAND_PROMPT,
    handModel: "hand-model",
    now: () => new Date("2026-06-28T00:00:00.000Z"),
  };
}

describe("GeminiAnalyzer.analyze", () => {
  it("4方向の河を読み、検証済みの Kifu を組み立てる", async () => {
    const client = new FakeClient();
    const analyzer = new GeminiAnalyzer(makeDeps(client, new FakePreprocessor()));

    const { kifu, geminiCalls } = await analyzer.analyze({
      riverImage: img("river"),
      cameraBottomSeat: "east",
    });

    expect(client.riverCalls).toBe(4);
    expect(geminiCalls).toBe(4); // 河4方向のみ（手牌なし）
    expect(kifu.schemaVersion).toBe("1.0.0");
    // bottom=手前=東 に河が入る（回転方向に依存しない不変条件）
    expect(kifu.seats.east.river[0]?.tile).toBe("1m");
  });

  it("河なし（手牌のみ＝何切る用）は河の読み取りをスキップし、呼び出し数にも数えない", async () => {
    const client = new FakeClient();
    const analyzer = new GeminiAnalyzer(makeDeps(client, new FakePreprocessor()));

    const { kifu, geminiCalls } = await analyzer.analyze({
      hands: { bottom: img("hand-bottom") },
      cameraBottomSeat: "east",
    });

    expect(client.riverCalls).toBe(0); // 河は読まない
    expect(geminiCalls).toBe(1); // 手牌1枚ぶんだけ課金
    expect(kifu.seats.east.hand[0]?.tile).toBe("2p");
    expect(kifu.seats.east.river).toEqual([]); // 河は空のまま（推測しない）
  });

  it("手牌が提供された方向だけ読み、その席の手牌に入る", async () => {
    const client = new FakeClient();
    const analyzer = new GeminiAnalyzer(makeDeps(client, new FakePreprocessor()));

    const input: AnalysisInput = {
      riverImage: img("river"),
      hands: { bottom: img("hand-bottom") },
      cameraBottomSeat: "east",
    };
    const { kifu, geminiCalls } = await analyzer.analyze(input);

    expect(client.handCalls).toBe(1); // 提供された1方向だけ
    expect(geminiCalls).toBe(5); // 河4 + 手牌1
    expect(kifu.seats.east.hand[0]?.tile).toBe("2p"); // bottom=東
  });

  it("1枚モード（handFromRiver）は四辺の帯を専用プロンプトで読み、四家の手牌に入る", async () => {
    const client = new FakeClient();
    const analyzer = new GeminiAnalyzer(makeDeps(client, new FakePreprocessor()));

    const { kifu, geminiCalls } = await analyzer.analyze({
      riverImage: img("river"),
      handFromRiver: true,
      cameraBottomSeat: "east",
    });

    expect(client.tableHandCalls).toBe(4); // 四家ぶん（伏せ牌の辺は空の手牌が返る想定）
    expect(client.handCalls).toBe(0);
    expect(geminiCalls).toBe(8); // 河4 + 1枚モード手牌4（課金も +4）
    expect(kifu.seats.east.hand[0]?.tile).toBe("3s"); // bottom=東
    expect(kifu.seats.south.hand[0]?.tile).toBe("3s"); // right=南（東の下家）
  });

  it("1枚モードでも明示の手牌写真がある方向はそちらが勝つ（その方向は帯を読まない）", async () => {
    const client = new FakeClient();
    const analyzer = new GeminiAnalyzer(makeDeps(client, new FakePreprocessor()));

    const { kifu, geminiCalls } = await analyzer.analyze({
      riverImage: img("river"),
      hands: { bottom: img("hand-bottom") },
      handFromRiver: true,
      cameraBottomSeat: "east",
    });

    expect(client.handCalls).toBe(1); // bottom は明示の寄り写真
    expect(client.tableHandCalls).toBe(3); // 残り3方向だけ帯から
    expect(geminiCalls).toBe(8);
    expect(kifu.seats.east.hand[0]?.tile).toBe("2p"); // 明示の寄り写真の結果
  });

  it("1枚モードは河写真が無ければ何もしない（何切る用の手牌のみ入力を壊さない）", async () => {
    const client = new FakeClient();
    const analyzer = new GeminiAnalyzer(makeDeps(client, new FakePreprocessor()));

    const { geminiCalls } = await analyzer.analyze({
      handFromRiver: true,
      cameraBottomSeat: "east",
    });

    expect(client.tableHandCalls).toBe(0);
    expect(geminiCalls).toBe(0);
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
