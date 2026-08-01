// infrastructure/gemini — 1枚モード（河写真から手前の手牌も読む）のクロップ決定ロジック（純粋）。
// 規格化撮影（卓全体・手前=自分）では、自分の手牌は写真の下端に横一列で写る。
// 下端の帯を全幅で切り出し、擬似的な「手牌の寄り写真」を作って手牌読みに渡す。
// docs/plans/one-shot-hand.md
//
// ⚠️【要実機検証】帯の高さ（現在 40%）は実画像で調整する。
//   手牌が切れる → 高さを増やす / 河が混ざりすぎて誤読する → 高さを減らす。

import type { DirectionLayout } from "./river-layout";

export function handFromTableLayout(): DirectionLayout {
  // 手前の手牌は正立済みなので回転不要。下端 40% の帯を全幅で
  // （副露が右端に寄っていても切らない）。
  return { crop: { x: 0, y: 0.6, width: 1, height: 0.4 }, rotateCW: 0 };
}
