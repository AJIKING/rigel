// infrastructure/gemini — RiverPreprocessor の実装。
// river-layout（どこを切り出してどれだけ回すか）を ImageProcessor（実ピクセル操作）に適用する。
// レイアウトは純粋・テスト済み。このクラスも ImageProcessor をフェイクにしてテストできる。

import { CameraSeatSchema, type CameraSeat } from "@rigel/schema";
import type { ImageRef } from "../../domain/kifu/analyzer";
import type { ImageProcessor } from "./image-processor";
import type { RiverPreprocessor } from "./river-preprocessor";
import { riverLayout } from "./river-layout";

export class ImageRiverPreprocessor implements RiverPreprocessor {
  constructor(private readonly ops: ImageProcessor) {}

  async split(river: ImageRef): Promise<Record<CameraSeat, ImageRef>> {
    const layout = riverLayout();
    const entries = await Promise.all(
      CameraSeatSchema.options.map(async (cam) => {
        const { crop, rotateCW } = layout[cam];
        const data = await this.ops.cropRotate(river.data, crop, rotateCW);
        const image: ImageRef = { data, mimeType: "image/jpeg" };
        return [cam, image] as const;
      }),
    );
    return Object.fromEntries(entries) as Record<CameraSeat, ImageRef>;
  }
}
