// infrastructure/gemini — カメラ相対のAI出力を絶対位置の Kifu に組み立てる。
// 各方向(bottom/right/top/left)を toAbsoluteSeat で東南西北へ写し、最後に KifuSchema で検証。

import {
  CameraSeatSchema,
  KifuSchema,
  SCHEMA_VERSION,
  toAbsoluteSeat,
  type AiHandResponse,
  type AiRiverResponse,
  type CameraSeat,
  type Discard,
  type Kifu,
  type Meld,
  type ReadTile,
  type Seat,
} from "@rigel/schema";

export interface AssembleParams {
  rivers: Record<CameraSeat, AiRiverResponse>;
  /** 手牌は任意（M5b で対応）。無ければ各席の手牌・鳴きは空。 */
  hands?: Partial<Record<CameraSeat, AiHandResponse>>;
  /** 撮影時に手前(bottom)だった絶対席。相対→絶対変換の基準。 */
  cameraBottomSeat: Seat;
  /** ISO8601。 */
  capturedAt: string;
}

interface MutableBoard {
  hand: ReadTile[];
  melds: Meld[];
  river: Discard[];
}

function emptyBoard(): MutableBoard {
  return { hand: [], melds: [], river: [] };
}

export function assembleKifu(params: AssembleParams): Kifu {
  const { rivers, hands, cameraBottomSeat, capturedAt } = params;

  const seats: Record<Seat, MutableBoard> = {
    east: emptyBoard(),
    south: emptyBoard(),
    west: emptyBoard(),
    north: emptyBoard(),
  };

  for (const cam of CameraSeatSchema.options) {
    const abs = toAbsoluteSeat(cam, cameraBottomSeat);
    seats[abs].river = rivers[cam].discards;

    const hand = hands?.[cam];
    if (hand) {
      seats[abs].hand = hand.hand;
      seats[abs].melds = hand.melds.map((m) => ({
        type: m.type,
        tiles: m.tiles,
        // 鳴き元もカメラ相対 → 絶対へ。暗槓(from=null)はそのまま。
        from: m.from ? toAbsoluteSeat(m.from, cameraBottomSeat) : null,
      }));
    }
  }

  // 保存前に全体を最終検証（信頼ゲート）。
  return KifuSchema.parse({
    schemaVersion: SCHEMA_VERSION,
    capturedAt,
    cameraBottomSeat,
    seats,
  });
}
