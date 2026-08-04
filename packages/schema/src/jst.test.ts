// JST(UTC+9) の日付ヘルパ。特訓クイズの無料枠キー（api の started_day）と
// マイページ「特訓」の日毎集計（@rigel/ui の quiz-stats）が同じ丸めを共有する。
// 日本にサマータイムは無いので固定オフセットでよい。

import { describe, expect, it } from "vitest";
import { JST_OFFSET_MS, jstDayOf, jstStartOfMonth, jstStartOfWeek } from "./jst";

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

describe("jstStartOfWeek（JST 月曜 0:00 起点の週初。ランキングの週間窓）", () => {
  it.each([
    // 2026-07-24 は金曜（JST）。週初 = JST 7/20(月) 0:00 = UTC 7/19 15:00。
    { name: "金曜の週初", utc: "2026-07-24T03:00:00.000Z", want: "2026-07-19T15:00:00.000Z" },
    // JST 月曜 0:00 ちょうどはその瞬間が週初。
    { name: "月曜 0:00 JST", utc: "2026-07-19T15:00:00.000Z", want: "2026-07-19T15:00:00.000Z" },
    // JST 日曜は6日前の月曜まで戻す。
    { name: "日曜", utc: "2026-07-26T03:00:00.000Z", want: "2026-07-19T15:00:00.000Z" },
    // UTC では前日でも JST では月曜（境界跨ぎ）。
    {
      name: "JST 火曜の早朝（UTC 月曜夜）",
      utc: "2026-07-20T16:00:00.000Z",
      want: "2026-07-19T15:00:00.000Z",
    },
  ])("$name", ({ utc, want }) => {
    expect(jstStartOfWeek(new Date(utc)).toISOString()).toBe(want);
  });
});

describe("jstStartOfMonth（JST 1日 0:00 起点の月初。ランキングの月間窓）", () => {
  it.each([
    { name: "月の途中", utc: "2026-07-24T03:00:00.000Z", want: "2026-06-30T15:00:00.000Z" },
    // JST 8/1 0:00（UTC 7/31 15:00）はその瞬間が月初。
    { name: "月初ちょうど", utc: "2026-07-31T15:00:00.000Z", want: "2026-07-31T15:00:00.000Z" },
    // UTC 7/31 14:59 は JST 7/31 なので 7月の月初。
    { name: "月末の JST 23:59", utc: "2026-07-31T14:59:59.999Z", want: "2026-06-30T15:00:00.000Z" },
    // 年跨ぎ（JST 1月 → 月初 = UTC 12/31 15:00）。
    { name: "年初", utc: "2027-01-01T03:00:00.000Z", want: "2026-12-31T15:00:00.000Z" },
  ])("$name", ({ utc, want }) => {
    expect(jstStartOfMonth(new Date(utc)).toISOString()).toBe(want);
  });
});

describe("JST_OFFSET_MS", () => {
  it("UTC+9 の固定オフセット（日本にサマータイムは無い）", () => {
    expect(JST_OFFSET_MS).toBe(9 * 60 * 60 * 1000);
  });
});
