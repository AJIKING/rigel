// 1枚モード（河写真から四家の手牌も読む。docs/plans/one-shot-hand.md）の
// クロップ決定ロジック（純粋）。四辺の外側の帯を、河と同じ回転で正立させる。
// 実寸の妥当性は実機検証。

import { CameraSeatSchema } from "@rigel/schema";
import { describe, expect, it } from "vitest";
import { handsFromTableLayout } from "./hand-layout";
import { riverLayout } from "./river-layout";

describe("handsFromTableLayout", () => {
  it("四方向それぞれ外側の帯を切り出す（0..1 の割合矩形）", () => {
    const layout = handsFromTableLayout();

    // 手前: 下端の帯 / 向かい: 上端の帯 / 左右: それぞれの端の縦帯。
    expect(layout.bottom.crop.y + layout.bottom.crop.height).toBeCloseTo(1);
    expect(layout.bottom.crop.width).toBe(1);
    expect(layout.top.crop.y).toBe(0);
    expect(layout.top.crop.width).toBe(1);
    expect(layout.left.crop.x).toBe(0);
    expect(layout.left.crop.height).toBe(1);
    expect(layout.right.crop.x + layout.right.crop.width).toBeCloseTo(1);
    expect(layout.right.crop.height).toBe(1);

    for (const cam of CameraSeatSchema.options) {
      const { x, y, width, height } = layout[cam].crop;
      for (const v of [x, y, width, height]) {
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThanOrEqual(1);
      }
    }
  });

  it("回転角は河（riverLayout）と同じ値を共有する（実機検証で直すとき一箇所で済む）", () => {
    const hands = handsFromTableLayout();
    const rivers = riverLayout();
    for (const cam of CameraSeatSchema.options) {
      expect(hands[cam].rotateCW).toBe(rivers[cam].rotateCW);
    }
  });
});
