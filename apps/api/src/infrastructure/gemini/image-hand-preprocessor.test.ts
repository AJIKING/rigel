// 1枚モードの前処理（河写真の四辺の帯 → 各家の手牌読み用の擬似寄り写真）。
// レイアウト（純粋）を ImageProcessor（実ピクセル操作）に適用する結線を固定する。

import { CameraSeatSchema } from "@rigel/schema";
import { describe, expect, it, vi } from "vitest";
import { fakeImage } from "../../test-support/image";
import { handsFromTableLayout } from "./hand-layout";
import { ImageHandPreprocessor } from "./image-hand-preprocessor";
import type { ImageProcessor } from "./image-processor";

describe("ImageHandPreprocessor", () => {
  it("四方向それぞれ handsFromTableLayout の矩形・回転で cropRotate し、JPEG の ImageRef を返す", async () => {
    const cropRotate = vi.fn((_src: ArrayBuffer, crop: { x: number }) =>
      Promise.resolve(new TextEncoder().encode(`cropped-${crop.x}`).buffer),
    );
    const ops = { cropRotate } as unknown as ImageProcessor;
    const pre = new ImageHandPreprocessor(ops);
    const river = fakeImage();

    const result = await pre.cropHands(river);

    const layout = handsFromTableLayout();
    for (const cam of CameraSeatSchema.options) {
      expect(cropRotate).toHaveBeenCalledWith(river.data, layout[cam].crop, layout[cam].rotateCW);
      expect(result[cam].mimeType).toBe("image/jpeg");
    }
    expect(cropRotate).toHaveBeenCalledTimes(4);
  });
});
