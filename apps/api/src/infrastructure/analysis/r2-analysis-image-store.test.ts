// R2 一時画像ストアの契約（docs/plans/async-analysis.md）。
// R2Bucket の使用面（put/get/list/delete）をフェイクで固定し、
// MIME の往復と prefix 一括削除（ページング込み）を検証する。

import { describe, expect, it } from "vitest";
import { R2AnalysisImageStore } from "./r2-analysis-image-store";

/** R2Bucket のうちストアが使う面だけのフェイク。 */
class FakeR2Bucket {
  objects = new Map<string, { data: ArrayBuffer; contentType?: string }>();
  /** list の1ページの大きさ（ページング検証用に小さくできる）。 */
  constructor(private readonly pageSize = 1000) {}

  put(key: string, data: ArrayBuffer, opts?: { httpMetadata?: { contentType?: string } }) {
    this.objects.set(key, { data, contentType: opts?.httpMetadata?.contentType });
    return Promise.resolve();
  }
  get(key: string) {
    const entry = this.objects.get(key);
    if (!entry) return Promise.resolve(null);
    return Promise.resolve({
      arrayBuffer: () => Promise.resolve(entry.data),
      httpMetadata: entry.contentType ? { contentType: entry.contentType } : undefined,
    });
  }
  list(opts: { prefix: string; cursor?: string }) {
    const keys = [...this.objects.keys()].filter((k) => k.startsWith(opts.prefix)).sort();
    const start = opts.cursor ? Number(opts.cursor) : 0;
    const page = keys.slice(start, start + this.pageSize);
    const truncated = start + this.pageSize < keys.length;
    return Promise.resolve({
      objects: page.map((key) => ({ key })),
      truncated,
      cursor: truncated ? String(start + this.pageSize) : undefined,
    });
  }
  delete(keys: string | string[]) {
    for (const key of Array.isArray(keys) ? keys : [keys]) this.objects.delete(key);
    return Promise.resolve();
  }
}

const image = { data: new TextEncoder().encode("jpeg-bytes").buffer, mimeType: "image/png" };

describe("R2AnalysisImageStore", () => {
  it("put/get で画像バイトと MIME が往復する（MIME 欠落は image/jpeg に倒す）", async () => {
    const bucket = new FakeR2Bucket();
    const store = new R2AnalysisImageStore(bucket as unknown as R2Bucket);

    await store.put("jobs/j1/river", image);
    const got = await store.get("jobs/j1/river");

    expect(got?.mimeType).toBe("image/png");
    expect(new Uint8Array(got!.data)).toEqual(new Uint8Array(image.data));

    bucket.objects.set("no-mime", { data: image.data });
    expect((await store.get("no-mime"))?.mimeType).toBe("image/jpeg");
  });

  it("不存在キーは null", async () => {
    const store = new R2AnalysisImageStore(new FakeR2Bucket() as unknown as R2Bucket);
    expect(await store.get("missing")).toBeNull();
  });

  it("deletePrefix は prefix 配下だけを消す（list のページングにも追従）", async () => {
    const bucket = new FakeR2Bucket(2); // 1ページ2件にしてページングを踏ませる
    const store = new R2AnalysisImageStore(bucket as unknown as R2Bucket);
    for (const key of ["jobs/j1/river", "jobs/j1/hand_bottom", "jobs/j1/hand_top"]) {
      await store.put(key, image);
    }
    await store.put("jobs/j2/river", image);

    await store.deletePrefix("jobs/j1/");

    expect([...bucket.objects.keys()]).toEqual(["jobs/j2/river"]);
  });
});
