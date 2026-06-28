// infrastructure/gemini — 河の前処理ポート（4分割＋正立）。
// 河1枚を bottom/right/top/left の4方向に切り出し、それぞれ正立させて返す。

import type { CameraSeat } from "@rigel/schema";
import type { ImageRef } from "../../domain/kifu/analyzer";

export interface RiverPreprocessor {
  split(river: ImageRef): Promise<Record<CameraSeat, ImageRef>>;
}
