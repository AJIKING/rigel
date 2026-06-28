// テスト用のダミー画像参照（本番バンドルには含まれない）。

import type { ImageRef } from "../domain/kifu/analyzer";

/** 中身は空でよい（解析は境界でモックするため）。mimeType でラベル分けにも使える。 */
export const fakeImage = (mimeType = "image/jpeg"): ImageRef => ({
  data: new ArrayBuffer(0),
  mimeType,
});
