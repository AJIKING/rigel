// interfaces/http 共有ヘルパの単体テスト。
// problemJson: photoDraftId（R2 内部 ID）は所有者以外への公開ペイロードに出さない（最小露出）。

import { describe, expect, it } from "vitest";
import { problemJson } from "./shared";

const post = { id: "p1", userId: "owner", title: "t", photoDraftId: "d-1" };

describe("problemJson", () => {
  it("所有者には photoDraftId を返す（元写真ボタンの出し分けに使う）", () => {
    expect(problemJson(post, "owner").photoDraftId).toBe("d-1");
  });

  it("他人・未ログインには photoDraftId を落とす（公開問題でも内部 ID を配らない）", () => {
    expect("photoDraftId" in problemJson(post, "viewer")).toBe(false);
    expect("photoDraftId" in problemJson(post, null)).toBe(false);
    expect("photoDraftId" in problemJson(post, undefined)).toBe(false);
  });
});
