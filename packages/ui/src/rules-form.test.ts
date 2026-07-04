import { RULE_PRESETS, RulesSchema } from "@rigel/schema";
import { describe, expect, it } from "vitest";
import { RULES_FORM, RULE_PRESET_OPTIONS } from "./rules-form";

describe("RULES_FORM（ルール設定フォームの共有定義）", () => {
  const defaults = RulesSchema.parse({});

  it("すべての行のキーが Rules の実在キーを指す", () => {
    for (const group of RULES_FORM) {
      for (const row of group.rows) {
        expect(row.key in defaults).toBe(true);
      }
    }
  });

  it("toggle 行のキーは boolean、seg 行のキーは string の Rules 値", () => {
    for (const group of RULES_FORM) {
      for (const row of group.rows) {
        const v = defaults[row.key];
        if (row.kind === "toggle") expect(typeof v).toBe("boolean");
        else expect(typeof v).toBe("string");
      }
    }
  });

  it("seg 行の選択肢は Rules の取りうる値を含む（既定値が候補にある）", () => {
    for (const group of RULES_FORM) {
      for (const row of group.rows) {
        if (row.kind !== "seg") continue;
        const values = row.options.map(([v]) => v);
        expect(values).toContain(String(defaults[row.key]));
      }
    }
  });

  it("RULE_PRESET_OPTIONS は RULE_PRESETS に対応する", () => {
    for (const opt of RULE_PRESET_OPTIONS) {
      expect(RULE_PRESETS[opt.key]).toBeDefined();
    }
  });

  it("主要な15項目を網羅する（合計行数）", () => {
    const rows = RULES_FORM.flatMap((g) => g.rows);
    expect(rows).toHaveLength(15);
  });
});
