import { describe, expect, it } from "vitest";
import { fmtDate, fmtDateSlash } from "./format";

describe("fmtDate", () => {
  it("ISO日時から日付部分(YYYY-MM-DD)を取り出す", () => {
    expect(fmtDate("2026-07-01T12:34:56Z")).toBe("2026-07-01");
  });
  it("日付のみの文字列はそのまま", () => {
    expect(fmtDate("2026-07-01")).toBe("2026-07-01");
  });
});

describe("fmtDateSlash", () => {
  it("ISO日時を YYYY/MM/DD に", () => {
    expect(fmtDateSlash("2026-07-01T00:00:00Z")).toBe("2026/07/01");
  });
});
