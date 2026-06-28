import type { CameraSeat } from "@rigel/schema";
import { describe, expect, it } from "vitest";
import { riverLayout } from "./river-layout";

describe("riverLayout", () => {
  const layout = riverLayout();
  const cams: CameraSeat[] = ["bottom", "right", "top", "left"];

  it("4方向ぶんの切り出し＋回転を返す", () => {
    expect(Object.keys(layout).sort()).toEqual([...cams].sort());
  });

  it("手前(bottom)は正立(0度)、向かい(top)は180度", () => {
    expect(layout.bottom.rotateCW).toBe(0);
    expect(layout.top.rotateCW).toBe(180);
  });

  it("left/right は 90 と 270 のどちらか（具体値は要実機検証）", () => {
    expect(new Set([layout.left.rotateCW, layout.right.rotateCW])).toEqual(new Set([90, 270]));
  });

  it("切り出し矩形はすべて 0..1 の範囲に収まる", () => {
    for (const cam of cams) {
      const { x, y, width, height } = layout[cam].crop;
      expect(x).toBeGreaterThanOrEqual(0);
      expect(y).toBeGreaterThanOrEqual(0);
      expect(x + width).toBeLessThanOrEqual(1);
      expect(y + height).toBeLessThanOrEqual(1);
    }
  });

  it("手前は下端、向かいは上端を含む", () => {
    expect(layout.bottom.crop.y + layout.bottom.crop.height).toBe(1); // 下端まで
    expect(layout.top.crop.y).toBe(0); // 上端から
  });
});
