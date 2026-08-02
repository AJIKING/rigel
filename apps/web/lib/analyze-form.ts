// /analyze 用の multipart FormData を組む（撮影フロー・局追加で共通）。
// フィールド名（river / cameraBottomSeat / hand_<cam> / gameId / handFromRiver）は API と一致させる。

import { CameraSeatSchema, type CameraSeat, type Seat } from "@rigel/schema";

export function buildAnalyzeForm(params: {
  river: File;
  cameraBottomSeat: Seat;
  hands: Partial<Record<CameraSeat, File>>;
  /** 既存の半荘へ追加する場合のみ。 */
  gameId?: string;
  /** 1枚モード（河写真から各家の手牌も読む）。true のときだけフラグを付ける。 */
  handFromRiver?: boolean;
}): FormData {
  const form = new FormData();
  form.append("river", params.river);
  form.append("cameraBottomSeat", params.cameraBottomSeat);
  if (params.gameId) form.append("gameId", params.gameId);
  if (params.handFromRiver) form.append("handFromRiver", "true");
  for (const cam of CameraSeatSchema.options) {
    const f = params.hands[cam];
    if (f) form.append(`hand_${cam}`, f);
  }
  return form;
}
