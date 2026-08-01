// 1枚モードの前処理（河写真の下端帯 → 手牌読み用の擬似寄り写真）。
// レイアウト（純粋）を ImageProcessor（実ピクセル操作）に適用する結線を固定する。

import { describe, expect, it, vi } from "vitest";
import { fakeImage } from "../../test-support/image";
import { handFromTableLayout } from "./hand-layout";
import { ImageHandPreprocessor } from "./image-hand-preprocessor";
import type { ImageProcessor } from "./image-processor";

describe("ImageHandPreprocessor", () => {
  it("handFromTableLayout の矩形で cropRotate し、JPEG の ImageRef を返す", async () => {
    const out = new TextEncoder().encode("cropped").buffer;
    const cropRotate = vi.fn(() => Promise.resolve(out));
    const ops: ImageProcessor = { cropRotate };
    const pre = new ImageHandPreprocessor(ops);
    const river = fakeImage();

    const result = await pre.cropHand(river);

    const { crop, rotateCW } = handFromTableLayout();
    expect(cropRotate).toHaveBeenCalledWith(river.data, crop, rotateCW);
    expect(result.mimeType).toBe("image/jpeg");
    expect(result.data).toBe(out);
  });
});
