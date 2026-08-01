// infrastructure/gemini — 1枚モードの前処理（河写真の下端帯 → 手牌読み用の擬似寄り写真）。
// レイアウト（hand-layout・純粋）を ImageProcessor（実ピクセル操作）に適用する。
// docs/plans/one-shot-hand.md

import type { ImageRef } from "../../domain/kifu/analyzer";
import { handFromTableLayout } from "./hand-layout";
import type { ImageProcessor } from "./image-processor";

export interface HandFromTablePreprocessor {
  /** 河写真から手前の手牌領域を切り出す。 */
  cropHand(river: ImageRef): Promise<ImageRef>;
}

export class ImageHandPreprocessor implements HandFromTablePreprocessor {
  constructor(private readonly ops: ImageProcessor) {}

  async cropHand(river: ImageRef): Promise<ImageRef> {
    const { crop, rotateCW } = handFromTableLayout();
    const data = await this.ops.cropRotate(river.data, crop, rotateCW);
    return { data, mimeType: "image/jpeg" };
  }
}
