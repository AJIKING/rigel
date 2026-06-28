// infrastructure/gemini — 画像処理のポート。
// 「どこを切り出してどれだけ回すか」は純粋ロジック(river-layout)で決め、
// 実際のピクセル操作だけをこのポートの裏（WASM 等）に閉じ込める。

/** 0..1 の割合で表す矩形（画素サイズに依存しない）。原点は左上。 */
export interface FracRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** 時計回りの回転角（90の倍数のみ）。 */
export type RotationCW = 0 | 90 | 180 | 270;

export interface ImageProcessor {
  /**
   * source を割合矩形 crop で切り出し、rotateCW 度（時計回り）回転して、
   * JPEG バイト列を返す。実体は WASM 画像ライブラリ（Photon 等）。
   */
  cropRotate(source: ArrayBuffer, crop: FracRect, rotateCW: RotationCW): Promise<ArrayBuffer>;
}
