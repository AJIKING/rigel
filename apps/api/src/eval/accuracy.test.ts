import { KifuSchema, type Kifu } from "@rigel/schema";
import { describe, expect, it } from "vitest";
import { aggregate, evaluateKifu } from "./accuracy";

function kifu(eastRiver: { tile: string | null; riichi?: boolean; confidence?: number }[]): Kifu {
  return KifuSchema.parse({
    schemaVersion: "1.0.0",
    capturedAt: "2026-06-28T00:00:00.000Z",
    seats: {
      east: {
        river: eastRiver.map((d, i) => ({
          order: i + 1,
          tile: d.tile,
          riichi: d.riichi ?? false,
          confidence: d.confidence ?? 1,
        })),
      },
      south: {},
      west: {},
      north: {},
    },
  });
}

describe("evaluateKifu", () => {
  it("完全一致なら全指標が最良", () => {
    const truth = kifu([{ tile: "1m" }, { tile: "2p", riichi: true }]);
    const r = evaluateKifu(truth, truth);
    expect(r.tileAccuracy).toBe(1);
    expect(r.highConfWrongRate).toBe(0);
    expect(r.riichiAccuracy).toBe(1);
  });

  it("自信満々の誤読を highConfWrong として数える", () => {
    const truth = kifu([{ tile: "1m" }, { tile: "2p" }]);
    const pred = kifu([
      { tile: "9m", confidence: 0.99 }, // 高信頼なのに誤読
      { tile: "2p", confidence: 0.99 },
    ]);
    const r = evaluateKifu(pred, truth);
    expect(r.tileCorrect).toBe(1);
    expect(r.tileAccuracy).toBe(0.5);
    expect(r.highConfWrong).toBe(1);
    expect(r.highConfWrongRate).toBe(0.5);
  });

  it("低信頼の誤読は highConfWrong に含めない", () => {
    const truth = kifu([{ tile: "1m" }]);
    const pred = kifu([{ tile: null, confidence: 0 }]); // 読めず（低信頼）
    const r = evaluateKifu(pred, truth);
    expect(r.tileAccuracy).toBe(0);
    expect(r.highConfTotal).toBe(0);
    expect(r.highConfWrong).toBe(0);
  });

  it("リーチフラグの一致を見る", () => {
    const truth = kifu([{ tile: "1m", riichi: true }]);
    const pred = kifu([{ tile: "1m", riichi: false }]); // 牌は合うがリーチ取りこぼし
    const r = evaluateKifu(pred, truth);
    expect(r.tileAccuracy).toBe(1);
    expect(r.riichiAccuracy).toBe(0);
  });
});

describe("aggregate", () => {
  it("複数局を件数ベースで集計する", () => {
    const a = evaluateKifu(kifu([{ tile: "9m", confidence: 0.99 }]), kifu([{ tile: "1m" }]));
    const b = evaluateKifu(kifu([{ tile: "2p" }]), kifu([{ tile: "2p" }]));
    const total = aggregate([a, b]);
    expect(total.tiles).toBe(2);
    expect(total.tileCorrect).toBe(1);
    expect(total.tileAccuracy).toBe(0.5);
    expect(total.highConfWrong).toBe(1);
  });
});
