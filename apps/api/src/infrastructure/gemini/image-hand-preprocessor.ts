// infrastructure/gemini — 1枚モードの前処理（河写真の四辺の帯 → 各家の手牌読み用の擬似寄り写真）。
// レイアウト（hand-layout・純粋）を ImageProcessor（実ピクセル操作）に適用する。
// docs/plans/one-shot-hand.md

import { CameraSeatSchema, type CameraSeat } from "@rigel/schema";
import type { ImageRef } from "../../domain/kifu/analyzer";
import { handsFromTableLayout } from "./hand-layout";
import type { ImageProcessor } from "./image-processor";

export interface HandFromTablePreprocessor {
  /** 河写真から四家の手牌領域（四辺の帯・正立済み）を切り出す。 */
  cropHands(river: ImageRef): Promise<Record<CameraSeat, ImageRef>>;
}

export class ImageHandPreprocessor implements HandFromTablePreprocessor {
  constructor(private readonly ops: ImageProcessor) {}

  async cropHands(river: ImageRef): Promise<Record<CameraSeat, ImageRef>> {
    const layout = handsFromTableLayout();
    const entries = await Promise.all(
      CameraSeatSchema.options.map(async (cam) => {
        const { crop, rotateCW } = layout[cam];
        const data = await this.ops.cropRotate(river.data, crop, rotateCW);
        return [cam, { data, mimeType: "image/jpeg" }] as const;
      }),
    );
    return Object.fromEntries(entries) as Record<CameraSeat, ImageRef>;
  }
}
