// 写真の multipart 送信用の変換（CaptureScreen / ProblemEditScreen で共用）。
// Expo SDK 57 では expo/fetch がグローバル fetch のため、RN 伝統の {uri,name,type}
// オブジェクトを FormData に入れると送信前に即例外になる（仕様準拠 FormData は
// Blob/File のみ）。expo-file-system の File（Blob 実装）へ変換して載せる。

import { File } from "expo-file-system";
import type { PickedImage } from "./pick-image";

export function toUploadFile(picked: PickedImage): Blob {
  // File は uri のファイル名から name/MIME を導出する（picker は拡張子付き cache URI を返す）。
  return new File(picked.uri) as unknown as Blob;
}
