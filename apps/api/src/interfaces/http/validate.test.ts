import { describe, expect, it } from "vitest";
import { minimalKifuInput } from "../../test-support/kifu";
import { parseKifu } from "./validate";

describe("parseKifu（背骨スキーマでの入力検証）", () => {
  it("正しい牌譜JSONを受理する", () => {
    expect(parseKifu(minimalKifuInput).ok).toBe(true);
  });

  it("schemaVersion 不一致を拒否し、エラー内容を返す", () => {
    const result = parseKifu({ ...minimalKifuInput, schemaVersion: "9.9.9" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.length).toBeGreaterThan(0);
  });

  it("null や非オブジェクトを拒否する", () => {
    expect(parseKifu(null).ok).toBe(false);
    expect(parseKifu("not json").ok).toBe(false);
  });
});
