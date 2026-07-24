import { KifuSchema, type Kifu } from "@rigel/schema";
import { describe, expect, it } from "vitest";
import { aggregate, evaluateKifu } from "./accuracy";

function kifu(eastRiver: { tile: string | null; riichi?: boolean }[]): Kifu {
  return KifuSchema.parse({
    schemaVersion: "1.0.0",
    capturedAt: "2026-06-28T00:00:00.000Z",
    seats: {
      east: {
        river: eastRiver.map((d, i) => ({
          order: i + 1,
          tile: d.tile,
          riichi: d.riichi ?? false,
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
    expect(r.misreadRate).toBe(0);
    expect(r.riichiAccuracy).toBe(1);
  });

  it("白旗（null）を揚げずに間違えた牌を misread として数える", () => {
    const truth = kifu([{ tile: "1m" }, { tile: "2p" }]);
    const pred = kifu([
      { tile: "9m" }, // 牌コードを出したのに誤読
      { tile: "2p" },
    ]);
    const r = evaluateKifu(pred, truth);
    expect(r.tileCorrect).toBe(1);
    expect(r.tileAccuracy).toBe(0.5);
    expect(r.misread).toBe(1);
    expect(r.asserted).toBe(2);
    expect(r.misreadRate).toBe(0.5);
  });

  it("null（読めず）は誤りでも misread に含めない（白旗は正しい振る舞い）", () => {
    const truth = kifu([{ tile: "1m" }]);
    const pred = kifu([{ tile: null }]); // 読めず
    const r = evaluateKifu(pred, truth);
    expect(r.tileAccuracy).toBe(0);
    expect(r.asserted).toBe(0);
    expect(r.misread).toBe(0);
  });

  it("全部 null（全白旗）の予測は misreadRate=0（白旗を最悪スコアにしない）", () => {
    const truth = kifu([{ tile: "1m" }, { tile: "2p" }]);
    const pred = kifu([{ tile: null }, { tile: null }]);
    const r = evaluateKifu(pred, truth);
    expect(r.misreadRate).toBe(0); // 誤読ゼロ・主張ゼロ。分母0で 1.0 に化けさせない
  });

  it("正解より多く読んだ（牌を発明した）ぶんは misread に数える", () => {
    const truth = kifu([{ tile: "1m" }]);
    const pred = kifu([{ tile: "1m" }, { tile: "5s" }]); // 2枚目は存在しない発明
    const r = evaluateKifu(pred, truth);
    expect(r.asserted).toBe(2);
    expect(r.misread).toBe(1);
    expect(r.misreadRate).toBe(0.5);
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
    const a = evaluateKifu(kifu([{ tile: "9m" }]), kifu([{ tile: "1m" }]));
    const b = evaluateKifu(kifu([{ tile: "2p" }]), kifu([{ tile: "2p" }]));
    const total = aggregate([a, b]);
    expect(total.tiles).toBe(2);
    expect(total.tileCorrect).toBe(1);
    expect(total.tileAccuracy).toBe(0.5);
    expect(total.misread).toBe(1);
    expect(total.asserted).toBe(2);
  });
});
