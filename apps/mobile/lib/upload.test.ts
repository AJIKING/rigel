// 写真アップロードの File 変換。Expo SDK 57 では expo/fetch がグローバル fetch になり、
// RN 伝統の {uri,name,type} オブジェクトは multipart で送れない（仕様準拠 FormData は
// Blob/File のみ受け付け、送信前に即例外 → 画面は「通信に失敗しました」）。
// expo-file-system の File（Blob 実装）へ変換してから FormData に載せる。

jest.mock("expo-file-system", () => ({
  File: class MockFile {
    uri: string;
    constructor(uri: string) {
      this.uri = uri;
    }
  },
}));

import { File } from "expo-file-system";
import { toUploadFile } from "./upload";

describe("toUploadFile", () => {
  it("PickedImage の uri から expo-file-system の File を作る", () => {
    const f = toUploadFile({
      uri: "file:///cache/photo.jpg",
      name: "photo.jpg",
      type: "image/jpeg",
    });

    expect(f).toBeInstanceOf(File as unknown as new (uri: string) => unknown);
    expect((f as unknown as { uri: string }).uri).toBe("file:///cache/photo.jpg");
  });
});
