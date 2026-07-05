import { describe, expect, it } from "vitest";
import { fkey, fmtPts } from "./shared";

describe("fkey", () => {
  it("河/手牌など meldIndex 無しは '-' で埋める", () => {
    expect(fkey({ seat: "east", area: "river", index: 3 })).toBe("east:river:-:3");
  });
  it("鳴きは meldIndex を含めて一意になる", () => {
    expect(fkey({ seat: "south", area: "meld", meldIndex: 1, index: 2 })).toBe("south:meld:1:2");
  });
});

describe("fmtPts", () => {
  it("正の値には + を付ける", () => {
    expect(fmtPts("12.3")).toBe("+12.3");
  });
  it("負の値はそのまま小数1桁", () => {
    expect(fmtPts("-4")).toBe("-4.0");
  });
  it("0 は +0.0", () => {
    expect(fmtPts("0")).toBe("+0.0");
  });
  it("数値でない入力は 0.0", () => {
    expect(fmtPts("abc")).toBe("0.0");
  });
});
