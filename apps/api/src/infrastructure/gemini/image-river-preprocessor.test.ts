import type { CameraSeat } from "@rigel/schema";
import { describe, expect, it } from "vitest";
import type { ImageRef } from "../../domain/kifu/analyzer";
import { ImageRiverPreprocessor } from "./image-river-preprocessor";
import type { FracRect, ImageProcessor, RotationCW } from "./image-processor";
import { riverLayout } from "./river-layout";

// 呼び出しを記録し、回転角を反映したダミーバイトを返すフェイク。
class RecordingImageProcessor implements ImageProcessor {
  readonly calls: { crop: FracRect; rotateCW: RotationCW }[] = [];
  cropRotate(_source: ArrayBuffer, crop: FracRect, rotateCW: RotationCW): Promise<ArrayBuffer> {
    this.calls.push({ crop, rotateCW });
    return Promise.resolve(new Uint8Array([rotateCW]).buffer);
  }
}

const river: ImageRef = { data: new ArrayBuffer(0), mimeType: "image/jpeg" };

describe("ImageRiverPreprocessor.split", () => {
  it("4方向ぶん cropRotate を呼び、JPEG の ImageRef を返す", async () => {
    const ops = new RecordingImageProcessor();
    const result = await new ImageRiverPreprocessor(ops).split(river);

    const cams: CameraSeat[] = ["bottom", "right", "top", "left"];
    for (const cam of cams) {
      expect(result[cam].mimeType).toBe("image/jpeg");
    }
    expect(ops.calls).toHaveLength(4);
  });

  it("各方向に river-layout の切り出し/回転を渡す", async () => {
    const ops = new RecordingImageProcessor();
    const result = await new ImageRiverPreprocessor(ops).split(river);
    const layout = riverLayout();

    // bottom は回転0、top は180（出力バイト先頭に回転角を入れている）
    expect(new Uint8Array(result.bottom.data)[0]).toBe(layout.bottom.rotateCW);
    expect(new Uint8Array(result.top.data)[0]).toBe(layout.top.rotateCW);
  });
});
