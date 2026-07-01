import { describe, expect, it } from "vitest";
import { YAKU_CATALOG, yakuByGroup, yakuHan, type YakuGroup } from "./yaku";

describe("役カタログ", () => {
  it("門前 / 鳴き可 / 役満 の3グループを持つ", () => {
    const groups = new Set<YakuGroup>(YAKU_CATALOG.map((y) => y.group));
    expect(groups).toEqual(new Set<YakuGroup>(["門前", "鳴き可", "役満"]));
  });

  it("立直は門前1飜・鳴き不可（openHan=0）", () => {
    const r = YAKU_CATALOG.find((y) => y.name === "立直");
    expect(r).toMatchObject({ han: 1, openHan: 0, group: "門前" });
  });

  it("清一色は門前6飜・鳴き5飜（食い下がり）", () => {
    const c = YAKU_CATALOG.find((y) => y.name === "清一色")!;
    expect(yakuHan(c, false)).toBe(6);
    expect(yakuHan(c, true)).toBe(5);
  });

  it("役満（国士無双）を含む", () => {
    expect(yakuByGroup()["役満"].some((y) => y.name === "国士無双")).toBe(true);
  });

  it("名前は重複しない", () => {
    const names = YAKU_CATALOG.map((y) => y.name);
    expect(new Set(names).size).toBe(names.length);
  });
});
