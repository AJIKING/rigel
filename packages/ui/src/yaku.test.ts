import { describe, expect, it } from "vitest";
import { inferOpen, selectYaku, YAKU_CATALOG, yakuByGroup, yakuHan, type YakuGroup } from "./yaku";

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

describe("selectYaku（役名リスト→門前/鳴きに応じた飜の振り直し）", () => {
  it("門前は han、鳴きは openHan（食い下がり）で振る", () => {
    expect(selectYaku(["混一色", "断幺九"], false)).toEqual([
      { name: "混一色", han: 3 },
      { name: "断幺九", han: 1 },
    ]);
    expect(selectYaku(["混一色", "断幺九"], true)).toEqual([
      { name: "混一色", han: 2 },
      { name: "断幺九", han: 1 },
    ]);
  });

  it("鳴きで不成立の門前限定役（立直等）は外す", () => {
    expect(selectYaku(["立直", "混一色"], true)).toEqual([{ name: "混一色", han: 2 }]);
  });
});

describe("inferOpen（保存済みの役から門前/鳴きの初期値を推定）", () => {
  it("門前限定役が保存されていれば門前（melds 記録が無くても巻き戻さない）", () => {
    expect(inferOpen([{ name: "立直", han: 1 }], true)).toBe(false);
  });

  it("食い下がり役の保存 han が鳴き値と一致すれば鳴き扱い", () => {
    expect(inferOpen([{ name: "混一色", han: 2 }], false)).toBe(true);
    expect(inferOpen([{ name: "混一色", han: 3 }], false)).toBe(false);
  });

  it("役から判別できなければ盤面の副露有無にフォールバック", () => {
    expect(inferOpen([], true)).toBe(true);
    expect(inferOpen([], false)).toBe(false);
    // 断幺九は門前/鳴きで同飜のため判別材料にならない。
    expect(inferOpen([{ name: "断幺九", han: 1 }], true)).toBe(true);
  });
});
