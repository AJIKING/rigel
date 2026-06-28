// infrastructure/gemini — 河の4分割＋正立の「決定ロジック」（純粋）。
// 河1枚（卓を上から、撮影ガイドで規格化）を、各方向の河ごとに切り出し、
// 正立させるための回転角を返す。実際の切り出し/回転は ImageProcessor が行う。
//
// 規格化撮影では卓の中心が中央、4辺が枠に合う。各方向の河を「その辺側の半分」で
// 大きめに切り出し、bottom と同じ正立条件に揃える。
//
// ⚠️【要実機検証】
//  - 切り出し矩形の正確さ（重なり/余白）は実画像で調整する。設計では分割確認フローを入れる。
//  - left/right の回転角（90 か 270 か）は撮影の向きに依存する（toAbsoluteSeat と同じ事情）。
//    bottom=0・top=180 は確定。left/right はどちらかが 90、もう一方が 270。

import type { CameraSeat } from "@rigel/schema";
import type { FracRect, RotationCW } from "./image-processor";

export interface DirectionLayout {
  crop: FracRect;
  rotateCW: RotationCW;
}

export function riverLayout(): Record<CameraSeat, DirectionLayout> {
  return {
    // 手前: 下半分・正立済み
    bottom: { crop: { x: 0, y: 0.5, width: 1, height: 0.5 }, rotateCW: 0 },
    // 向かい: 上半分・180度
    top: { crop: { x: 0, y: 0, width: 1, height: 0.5 }, rotateCW: 180 },
    // 左: 左半分・時計回り90度で正立（⚠️要実機検証）
    left: { crop: { x: 0, y: 0, width: 0.5, height: 1 }, rotateCW: 90 },
    // 右: 右半分・時計回り270度で正立（⚠️要実機検証）
    right: { crop: { x: 0.5, y: 0, width: 0.5, height: 1 }, rotateCW: 270 },
  };
}
