// infrastructure/analysis — 元写真ストアの R2 実装（バケット rigel・恒久保存。
// [決定] 2026-08-03 photo-retention.md）。TTL は無く、削除はデータ削除時の
// deletePrefix のみ（list のページングに追従して確実に消す）。
// MIME は R2 の httpMetadata.contentType で往復させる。

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

  async delete(key: string): Promise<void> {
    await this.bucket.delete(key);
  }

  async putJson(key: string, value: unknown): Promise<void> {
    await this.bucket.put(key, JSON.stringify(value), {
      httpMetadata: { contentType: "application/json" },
    });
  }

  async getJson(key: string): Promise<unknown | null> {
    const object = await this.bucket.get(key);
    if (!object) return null;
    // 壊れた JSON（想定外の書き込み）は「無い」と同じ扱い（呼び出し側が failed に落とす）。
    try {
      return JSON.parse(await object.text()) as unknown;
    } catch {
      return null;
    }
  }

  async listKeys(prefix: string): Promise<string[]> {
    const keys: string[] = [];
    let cursor: string | undefined;
    for (;;) {
      const listed = await this.bucket.list({ prefix, ...(cursor ? { cursor } : {}) });
      keys.push(...listed.objects.map((o) => o.key));
      if (!listed.truncated) return keys;
      cursor = listed.cursor;
    }
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
