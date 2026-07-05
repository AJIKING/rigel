import { describe, expect, it } from "vitest";
import { notenDeltas } from "./standings";

describe("notenDeltas（流局の不聴罰符）", () => {
  it("1人聴牌: +3000 / 不聴3人 -1000", () => {
    expect(notenDeltas(["east"])).toEqual({ east: 3000, south: -1000, west: -1000, north: -1000 });
  });
  it("2人聴牌: +1500 / -1500", () => {
    expect(notenDeltas(["east", "south"])).toEqual({
      east: 1500,
      south: 1500,
      west: -1500,
      north: -1500,
    });
  });
  it("3人聴牌: +1000 / 不聴1人 -3000", () => {
    expect(notenDeltas(["east", "south", "west"])).toEqual({
      east: 1000,
      south: 1000,
      west: 1000,
      north: -3000,
    });
  });
  it("全員聴牌/全員不聴は移動なし", () => {
    const z = { east: 0, south: 0, west: 0, north: 0 };
    expect(notenDeltas([])).toEqual(z);
    expect(notenDeltas(["east", "south", "west", "north"])).toEqual(z);
  });
  it("重複席は1人扱い", () => {
    expect(notenDeltas(["east", "east"])).toEqual({
      east: 3000,
      south: -1000,
      west: -1000,
      north: -1000,
    });
  });
});
