// 特訓クイズの回数制限キー = JST の日付（'YYYY-MM-DD'）。
// 無料枠は「JST 0時回復」なので、UTC 15:00 が日付の境界になる。

import { describe, expect, it } from "vitest";
import { jstDayOf } from "./quiz-session";

describe("jstDayOf（UTC 時刻 → JST 'YYYY-MM-DD'）", () => {
  it.each([
    { name: "UTC 昼は同日", utc: "2026-07-24T03:00:00.000Z", want: "2026-07-24" },
    {
      name: "UTC 14:59:59 は JST 23:59:59 で同日",
      utc: "2026-07-24T14:59:59.999Z",
      want: "2026-07-24",
    },
    {
      name: "UTC 15:00 は JST 0:00 で翌日（回復境界）",
      utc: "2026-07-24T15:00:00.000Z",
      want: "2026-07-25",
    },
    {
      name: "月末境界（UTC 7/31 15:00 → JST 8/1）",
      utc: "2026-07-31T15:00:00.000Z",
      want: "2026-08-01",
    },
    {
      name: "年末境界（UTC 12/31 15:00 → JST 1/1）",
      utc: "2026-12-31T15:00:00.000Z",
      want: "2027-01-01",
    },
    { name: "1桁の月日はゼロ埋め", utc: "2026-01-02T00:00:00.000Z", want: "2026-01-02" },
  ])("$name", ({ utc, want }) => {
    expect(jstDayOf(new Date(utc))).toBe(want);
  });
});
