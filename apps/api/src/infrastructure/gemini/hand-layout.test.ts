// 1枚モード（河写真から手前の手牌も読む。docs/plans/one-shot-hand.md）の
// クロップ決定ロジック（純粋）。矩形の不変条件を固定する。実寸の妥当性は実機検証。

import { describe, expect, it } from "vitest";
import { handFromTableLayout } from "./hand-layout";

describe("handFromTableLayout", () => {
  it("下端の帯を全幅・回転なしで切り出す（0..1 の割合矩形）", () => {
    const { crop, rotateCW } = handFromTableLayout();

    expect(rotateCW).toBe(0); // 手前の手牌は正立済み
    expect(crop.x).toBe(0);
    expect(crop.width).toBe(1); // 全幅（副露が右に寄っていても切らない）
    expect(crop.y).toBeGreaterThan(0.5); // 下半分のさらに下側の帯
    expect(crop.y + crop.height).toBeCloseTo(1); // 下端まで
    for (const v of [crop.x, crop.y, crop.width, crop.height]) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1);
    }
  });
});
