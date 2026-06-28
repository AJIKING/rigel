// domain/kifu — Analyzer ポート（写真 → 牌譜ドラフト）。
// 実体(Gemini + 4分割/正立 + Zod検証)は infrastructure 層。M5 で実装する。
// この境界をモックできることが、AI(非決定的)を Unit テストから切り離す鍵。

import type { Kifu, Seat } from "@rigel/schema";

/** 画像は永続化しない。バイト列を参照で渡し、解析後は破棄する。 */
export interface ImageRef {
  data: ArrayBuffer;
  mimeType: string;
}

export interface AnalysisInput {
  /** 河（卓を上から1枚）。4分割＋正立はパイプライン内部で行う。 */
  riverImage: ImageRef;
  /** 各プレイヤーの手牌（正立済み・1人1枚）。 */
  handImages: ImageRef[];
  /** 撮影時に手前(bottom)だった席。相対→絶対変換の基準。 */
  cameraBottomSeat: Seat;
}

export interface Analyzer {
  /**
   * 画像から牌譜ドラフトを生成する。
   * 返す Kifu は KifuSchema で検証済みであることを契約とする（信頼ゲート）。
   * 読めない牌は推測で埋めず null + confidence:0 のままにする。
   */
  analyze(input: AnalysisInput): Promise<Kifu>;
}
