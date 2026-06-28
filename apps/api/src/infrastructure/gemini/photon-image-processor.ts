// infrastructure/gemini — ImageProcessor の実体（@cf-wasm/photon / WASM）。
// 河の切り出し＋回転を実際のピクセル操作で行う。WASM は遅延 import（モジュール読込で
// ロードしない）し、解析時にだけ初期化する。
//
// ⚠️ ここは WASM/実画像が要るため Unit テスト対象外（要実機検証）。回転方向(CW/CCW)や
//    切り出し精度は river-layout 側の [要実機検証] とセットで実画像で確認する。

import type { FracRect, ImageProcessor, RotationCW } from "./image-processor";

export class PhotonImageProcessor implements ImageProcessor {
  async cropRotate(
    source: ArrayBuffer,
    crop: FracRect,
    rotateCW: RotationCW,
  ): Promise<ArrayBuffer> {
    const photon = await import("@cf-wasm/photon");

    const img = photon.PhotonImage.new_from_byteslice(new Uint8Array(source));
    const toFree = [img];
    try {
      const w = img.get_width();
      const h = img.get_height();
      const x1 = Math.round(crop.x * w);
      const y1 = Math.round(crop.y * h);
      const x2 = Math.round((crop.x + crop.width) * w);
      const y2 = Math.round((crop.y + crop.height) * h);

      const cropped = photon.crop(img, x1, y1, x2, y2);
      toFree.push(cropped);

      let result = cropped;
      if (rotateCW !== 0) {
        result = photon.rotate(cropped, rotateCW);
        toFree.push(result);
      }

      const jpeg = result.get_bytes_jpeg(85);
      // WASM メモリへの view なので、解放前に独立した ArrayBuffer へコピーする。
      const out = new ArrayBuffer(jpeg.byteLength);
      new Uint8Array(out).set(jpeg);
      return out;
    } finally {
      for (const i of toFree) i.free();
    }
  }
}
