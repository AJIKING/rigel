// infrastructure/gemini — 1枚モード（河写真から四家の手牌も読む）のクロップ決定ロジック（純粋）。
// 対局終了時に全員が手牌を開けて卓全体を撮ると、各家の手牌は卓の四辺（外側の帯）に写る。
// 河の「4分割＋正立」と同じ発想で、各辺の外側の帯を切り出し、河と同じ回転角で正立させて
// 手牌読みに渡す。伏せ牌しか写っていない辺はプロンプト側で空の手牌（null 白旗）にする。
// docs/plans/one-shot-hand.md
//
// ⚠️【要実機検証】帯の厚み（現在 40%）は実画像で調整する。
//   手牌が切れる → 厚みを増やす / 河が混ざりすぎて誤読する → 減らす。
//   回転角は riverLayout と共有（あちらの実機検証で直せばこちらも直る）。

import type { CameraSeat } from "@rigel/schema";
import { riverLayout, type DirectionLayout } from "./river-layout";

const BAND = 0.4;

export function handsFromTableLayout(): Record<CameraSeat, DirectionLayout> {
  const rotations = riverLayout();
  return {
    // 手前: 下端の帯（正立済み）。
    bottom: {
      crop: { x: 0, y: 1 - BAND, width: 1, height: BAND },
      rotateCW: rotations.bottom.rotateCW,
    },
    // 向かい: 上端の帯。
    top: { crop: { x: 0, y: 0, width: 1, height: BAND }, rotateCW: rotations.top.rotateCW },
    // 左右: それぞれの端の縦帯。
    left: { crop: { x: 0, y: 0, width: BAND, height: 1 }, rotateCW: rotations.left.rotateCW },
    right: {
      crop: { x: 1 - BAND, y: 0, width: BAND, height: 1 },
      rotateCW: rotations.right.rotateCW,
    },
  };
}
