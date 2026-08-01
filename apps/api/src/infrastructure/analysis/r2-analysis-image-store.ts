// infrastructure/analysis — 一時画像ストアの R2 実装（docs/plans/async-analysis.md）。
// 画像は「解析ジョブの間だけ」の存在。MIME は R2 の httpMetadata.contentType で往復させる。
// deletePrefix は list のページングに追従して確実に消す（保険はバケットのライフサイクル1日）。

import type { AnalysisImageStore } from "../../domain/analysis/analysis-transport";
import type { ImageRef } from "../../domain/kifu/analyzer";

export class R2AnalysisImageStore implements AnalysisImageStore {
  constructor(private readonly bucket: R2Bucket) {}

  async put(key: string, image: ImageRef): Promise<void> {
    await this.bucket.put(key, image.data, {
      httpMetadata: { contentType: image.mimeType },
    });
  }

  async get(key: string): Promise<ImageRef | null> {
    const object = await this.bucket.get(key);
    if (!object) return null;
    return {
      data: await object.arrayBuffer(),
      mimeType: object.httpMetadata?.contentType ?? "image/jpeg",
    };
  }

  async deletePrefix(prefix: string): Promise<void> {
    // 消したぶんリストがずれるので cursor は使わず、空になるまで先頭から取り直す。
    for (;;) {
      const listed = await this.bucket.list({ prefix });
      if (listed.objects.length === 0) return;
      await this.bucket.delete(listed.objects.map((o) => o.key));
      if (!listed.truncated) return;
    }
  }
}
