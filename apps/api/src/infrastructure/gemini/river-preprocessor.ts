// infrastructure/gemini — 河の前処理ポート（4分割＋正立）。
// 河1枚を bottom/right/top/left の4方向に切り出し、それぞれ正立させて返す。
// 実体は image processing（Cloudflare Images / WASM 等）が要るため未実装（M5b）。
// ポートとして切り出しておくことで、analyzer 本体（Gemini 連携）は先に実装・テストできる。

import type { CameraSeat } from "@rigel/schema";
import type { ImageRef } from "../../domain/kifu/analyzer";

export interface RiverPreprocessor {
  split(river: ImageRef): Promise<Record<CameraSeat, ImageRef>>;
}

/** 未実装スタブ。呼ばれたら明示的に失敗する。 */
export class UnimplementedRiverPreprocessor implements RiverPreprocessor {
  split(_river: ImageRef): Promise<Record<CameraSeat, ImageRef>> {
    return Promise.reject(
      new Error("河の4分割＋正立は未実装です（要 image processing: Cloudflare Images / WASM）"),
    );
  }
}
