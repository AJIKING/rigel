// JST(UTC+9) の日付ヘルパ。特訓クイズの無料枠キー（api の started_day）と
// マイページ「特訓」の日毎集計（@rigel/ui の quiz-stats）が同じ丸めを共有する。
// 日本にサマータイムは無いので固定オフセットでよい。

import { describe, expect, it } from "vitest";
import { JST_OFFSET_MS, jstDayOf } from "./jst";

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

  // quiz-stats.ts（@rigel/ui）の日インデックス実装 floor((ms+offset)/日) と同じ丸めであること
  // （移設前の独立実装2つ = api の jstDayOf と ui の jstDayIndex+dayString の挙動一致を焼き付ける）。
  it("日毎集計の丸め（floor((ms+JST_OFFSET_MS)/日) → UTC日付文字列）と一致する", () => {
    const DAY_MS = 86_400_000;
    for (const utc of [
      "2026-07-24T03:00:00.000Z",
      "2026-07-24T14:59:59.999Z",
      "2026-07-24T15:00:00.000Z",
      "2026-12-31T15:00:00.000Z",
    ]) {
      const ms = Date.parse(utc);
      const viaIndex = new Date(Math.floor((ms + JST_OFFSET_MS) / DAY_MS) * DAY_MS)
        .toISOString()
        .slice(0, 10);
      expect(jstDayOf(new Date(ms))).toBe(viaIndex);
    }
  });
});

describe("JST_OFFSET_MS", () => {
  it("UTC+9 の固定オフセット（日本にサマータイムは無い）", () => {
    expect(JST_OFFSET_MS).toBe(9 * 60 * 60 * 1000);
  });
});
