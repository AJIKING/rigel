import { describe, expect, it } from "vitest";
import { parseDotEnv } from "./dotenv";

describe("parseDotEnv（.dev.vars の簡易パース）", () => {
  it("KEY=VALUE を読む（前後空白は無視）", () => {
    expect(parseDotEnv("A=1\n B = two ")).toEqual({ A: "1", B: "two" });
  });

  it("コメント行・空行を無視する", () => {
    expect(parseDotEnv("# comment\n\nA=1\n# B=2")).toEqual({ A: "1" });
  });

  it("クォートを剥がす", () => {
    expect(parseDotEnv("A=\"quoted value\"\nB='single'")).toEqual({
      A: "quoted value",
      B: "single",
    });
  });

  it("値の中の = は保持する", () => {
    expect(parseDotEnv("URL=https://x/y?a=b=c")).toEqual({ URL: "https://x/y?a=b=c" });
  });
});
