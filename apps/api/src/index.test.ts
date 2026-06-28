import { describe, it, expect } from "vitest";
import { parseKifu } from "./index";

const validKifu = {
  schemaVersion: "1.0.0",
  capturedAt: "2026-06-28T00:00:00.000Z",
  seats: { east: {}, south: {}, west: {}, north: {} },
};

describe("parseKifu（共有スキーマでの検証）", () => {
  it("正しい牌譜JSONを受理する", () => {
    const result = parseKifu(validKifu);
    expect(result.ok).toBe(true);
  });

  it("schemaVersion 不一致を拒否し、エラー内容を返す", () => {
    const result = parseKifu({ ...validKifu, schemaVersion: "9.9.9" });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.length).toBeGreaterThan(0);
    }
  });

  it("null や非オブジェクトを拒否する", () => {
    expect(parseKifu(null).ok).toBe(false);
    expect(parseKifu("not json").ok).toBe(false);
  });
});
